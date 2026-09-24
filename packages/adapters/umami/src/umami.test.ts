import { event, Trace } from "@priemskiyyy/trace";
import type { TrackContext } from "@priemskiyyy/trace";
import { expect, onTestFinished, test } from "vitest";

import { fakeUmami } from "src/fakeUmami.fixture";
import { createTrackedEvent } from "src/trackedEvent.fixture";
import { umami } from "src/umami";

const TIMESTAMP = 1_767_225_600_000;

const TIMESTAMP_LOSS = { path: "timestamp", reason: "unsupported" };

const PAGE_VIEW = {
  website: "b59e9c65-ae32-47f1-8400-119fcf4861c4",
  hostname: "shop.example",
  language: "en-US",
  referrer: "",
  screen: "1280x720",
  title: "Boutique",
  url: "https://shop.example/cart",
};

const context: TrackContext = {
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
};

const events = {
  "Note Added": event<{ note: string }>(),
};

const createTrace = (
  fake = fakeUmami(),
  options: { consent?: { site: ["analytics"] } } = {},
) => {
  const trace = new Trace({
    events,
    destinations: { site: umami({ sdk: fake.sdk }) },
    now: () => TIMESTAMP,
    ...options,
  });

  onTestFinished(trace.dispose);

  return { fake, trace };
};

const open = (fake = fakeUmami()) => ({
  fake,
  session: umami({ sdk: fake.sdk }).open(),
});

const watchUnhandledRejections = () => {
  const rejections: unknown[] = [];

  const handleRejection = (reason: unknown) => {
    rejections.push(reason);
  };

  process.on("unhandledRejection", handleRejection);
  onTestFinished(() => {
    process.off("unhandledRejection", handleRejection);
  });

  return rejections;
};

test("creating the adapter calls nothing on Umami", () => {
  const fake = fakeUmami();

  umami({ sdk: fake.sdk });

  expect(fake.calls).toStrictEqual({ track: 0, identify: 0 });
});

test("open calls nothing on Umami, whose tracker keeps no state Trace could read", () => {
  const { fake, session } = open();

  expect(session.native).toBe(fake.sdk);
  expect(fake.calls).toStrictEqual({ track: 0, identify: 0 });
});

test("an event is one track call in its function form, with the page's payload, its name, its data and its user's id, submitted as the call returns", () => {
  const { fake, session } = open();

  const answer = session.track(
    createTrackedEvent({
      properties: { plan: "pro", value: 49.5 },
      context: { plan: "free", locale: "de" },
    }),
    context,
  );

  expect(fake.sent).toStrictEqual([
    {
      type: "event",
      payload: {
        ...PAGE_VIEW,
        name: "Checkout Started",
        data: { plan: "pro", locale: "de", value: 49.5 },
        id: "ada",
      },
    },
  ]);
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [{ path: "context.plan", reason: "omitted" }, TIMESTAMP_LOSS],
  });
});

test("an anonymous event carries no id, even when the page's tracker holds one", () => {
  const { fake, session } = open();

  fake.state.identity = "grace";

  session.track(
    createTrackedEvent({
      identity: { generation: 0, user: null, traits: {}, groups: {} },
    }),
    context,
  );

  expect(fake.sent[0]?.payload).toStrictEqual({
    ...PAGE_VIEW,
    name: "Checkout Started",
    data: {},
  });
});

test("a user id Umami would cut is left out of the event as invalid, and reported last", () => {
  const { fake, session } = open();

  const answer = session.track(
    createTrackedEvent({
      name: "e".repeat(51),
      identity: {
        generation: 1,
        user: { id: "u".repeat(51) },
        traits: {},
        groups: {},
      },
    }),
    context,
  );

  expect(fake.sent[0]?.payload).toStrictEqual({
    ...PAGE_VIEW,
    name: "e".repeat(51),
    data: {},
  });
  expect(answer).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [
      { path: "name", reason: "truncated" },
      TIMESTAMP_LOSS,
      { path: "identity.user.id", reason: "invalid" },
    ],
  });
});

test("an event the tracker sends nowhere, while tracking is disabled, is still submitted, because the call proves no more", () => {
  const { fake, session } = open();

  fake.state.disabled = true;

  expect(session.track(createTrackedEvent(), context)).toStrictEqual({
    status: "submitted",
    evidence: "sdk-call-returned",
    losses: [TIMESTAMP_LOSS],
  });
  expect(fake.sent).toStrictEqual([]);
});

test("a promise Umami rejects never reaches the application as an unhandled rejection", async () => {
  const rejections = watchUnhandledRejections();
  const { fake, session } = open();

  fake.state.failing = true;
  session.track(createTrackedEvent(), context);

  // Node reports a rejection nothing handled once the microtask queue drains.
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  expect(rejections).toStrictEqual([]);
});

test("through Trace, each event carries the user it was tracked for: an anonymous event held until after a sign-in goes without an id", async () => {
  const { fake, trace } = createTrace();

  const anonymous = trace.track("Note Added", { note: "before sign-in" });

  trace.user({ id: "ada" });

  const signedIn = trace.track("Note Added", { note: "signed in" });

  trace.start();
  await anonymous.settled;
  await signedIn.settled;
  trace.user(null);
  await trace.track("Note Added", { note: "signed out" }).settled;

  expect(
    fake.sent.map(({ payload }) => [payload.data, payload.id]),
  ).toStrictEqual([
    [{ note: "before sign-in" }, undefined],
    [{ note: "signed in" }, "ada"],
    [{ note: "signed out" }, undefined],
  ]);
  expect(fake.calls.identify).toBe(0);
});

test("the session has no identity methods, collection or flush, because the id travels on each event", () => {
  expect(Object.keys(open().session)).toStrictEqual(["native", "track"]);
});

test("a gated Umami receives nothing while consent is closed", async () => {
  const { fake, trace } = createTrace(fakeUmami(), {
    consent: { site: ["analytics"] },
  });

  trace.start();

  await expect(
    trace.track("Note Added", { note: "before" }).settled,
  ).resolves.toStrictEqual({ state: "dropped", reason: "consent" });

  trace.consent.set({ analytics: "granted" });
  await trace.track("Note Added", { note: "after" }).settled;

  expect(fake.sent.map(({ payload }) => payload.data)).toStrictEqual([
    { note: "after" },
  ]);
});

test("flush reports unsupported, because each event is its own request", async () => {
  const { trace } = createTrace();

  trace.start();

  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { site: { status: "unsupported" } },
  });
});

test("the native handle is the tracker the application passed", () => {
  const { fake, trace } = createTrace();

  trace.start();

  expect(trace.destination("site").native).toBe(fake.sdk);
});

test("Trace never calls identify on Umami, whose distinct id would stick to the page", async () => {
  const { fake, trace } = createTrace(fakeUmami(), {
    consent: { site: ["analytics"] },
  });

  trace.start();
  trace.consent.set({ analytics: "granted" });
  trace.user({ id: "ada", traits: { plan: "pro" } });
  trace.group("workspace", { id: "workspace_1" });
  await trace.track("Note Added", { note: "hello" }).settled;
  trace.user(null);
  await trace.flush();
  trace.consent.set({ analytics: "denied" });
  trace.dispose();

  expect(fake.calls).toStrictEqual({ track: 1, identify: 0 });
});
