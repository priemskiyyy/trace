import { event, Trace } from "@priemskiyyy/trace";
import * as FirebaseAnalytics from "firebase/analytics";
import { deleteApp, initializeApp } from "firebase/app";
import { afterAll, expect, onTestFinished, test, vi } from "vitest";

import { firebase } from "src/firebase";
import { ga4 } from "src/ga4";
import { createTrackedEvent } from "src/trackedEvent.fixture";

type Command = {
  command: string;
  target: unknown;
  parameters: Record<string, unknown>;
  user: unknown;
};

type Waiter = { matches: (command: Command) => boolean; resolve: () => void };

const APP_ID = "1:1234567890:web:0a1b2c3d4e5f";
const MEASUREMENT_ID = "G-TRACE-LOCAL";
const COLLECTION_SWITCH = `ga-disable-${MEASUREMENT_ID}`;
const TIMESTAMP = 1_767_225_600_000;

const events = {
  ada_event: event<{ value: number }>(),
  bob_event: event<{ value: number }>(),
  after_reset: event(),
  while_off: event(),
  while_on: event(),
  dee_event: event<{ value: number }>(),
  eve_event: event<{ value: number }>(),
};

const map = ga4(events, {
  ada_event: ({ name, properties }) => ({ name, parameters: properties }),
  bob_event: ({ name, properties }) => ({ name, parameters: properties }),
  after_reset: ({ name }) => ({ name, parameters: {} }),
  while_off: ({ name }) => ({ name, parameters: {} }),
  while_on: ({ name }) => ({ name, parameters: {} }),
  dee_event: ({ name, properties }) => ({ name, parameters: properties }),
  eve_event: ({ name, properties }) => ({ name, parameters: properties }),
});

const createContext = () => ({
  signal: new AbortController().signal,
  currentGeneration: () => 1,
  now: () => TIMESTAMP,
});

const setUpFirebase = async () => {
  const commands: Command[] = [];
  const waiters: Waiter[] = [];
  const warnings: string[] = [];

  let user: unknown = null;

  vi.spyOn(console, "warn").mockImplementation((...values: unknown[]) => {
    warnings.push(values.map(String).join(" "));
  });

  const gtag = (
    command: string,
    target: unknown,
    parameters: Record<string, unknown> = {},
  ) => {
    if (command === "config" && Object.hasOwn(parameters, "user_id")) {
      user = parameters["user_id"];
    }

    const recorded = { command, target, parameters, user };

    commands.push(recorded);

    for (const waiter of waiters.filter(({ matches }) => matches(recorded))) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }

    const callback = parameters["event_callback"];

    // gtag.js runs event_callback once it has processed the event.
    if (command === "event" && typeof callback === "function") {
      callback();
    }
  };

  const reached = (matches: (command: Command) => boolean) =>
    new Promise<void>((resolve) => {
      if (commands.some(matches)) {
        resolve();

        return;
      }

      waiters.push({ matches, resolve });
    });

  const document = {
    getElementsByTagName: () => [
      { src: "https://www.googletagmanager.com/gtag/js?l=dataLayer" },
    ],
  };

  const page: Record<string, unknown> = { document, gtag };

  vi.stubGlobal("window", page);
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", { cookieEnabled: true, onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ appId: APP_ID, measurementId: MEASUREMENT_ID }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ),
  );

  const app = initializeApp(
    {
      appId: APP_ID,
      measurementId: MEASUREMENT_ID,
      apiKey: "local-fake-key",
      projectId: "trace-local-test",
    },
    "trace-firebase-sdk-test",
  );

  const analytics = FirebaseAnalytics.initializeAnalytics(app, {
    config: { send_page_view: false },
  });

  await reached(
    ({ command, parameters }) =>
      command === "config" && parameters["origin"] === "firebase",
  );

  return { app, analytics, commands, reached, page, warnings };
};

const ready = setUpFirebase();

afterAll(async () => {
  const { app } = await ready;

  await deleteApp(app);
  vi.unstubAllGlobals();
});

test("the real SDK initializes here with only its warning that IndexedDB is missing", async () => {
  const { warnings } = await ready;

  expect(warnings).toEqual([
    expect.stringContaining("(analytics/indexeddb-unavailable)"),
  ]);
});

test("the real SDK lets a later user id reach gtag before an earlier event", async () => {
  const { analytics, commands, reached } = await ready;
  const from = commands.length;

  FirebaseAnalytics.setUserId(analytics, "raw-ada");
  FirebaseAnalytics.logEvent(analytics, "raw_ada_event", {});
  FirebaseAnalytics.setUserId(analytics, "raw-bob");
  FirebaseAnalytics.logEvent(analytics, "raw_bob_event", {});
  await reached(({ target }) => target === "raw_bob_event");

  expect(commands.slice(from)).toEqual([
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: "raw-ada" },
      user: "raw-ada",
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: "raw-bob" },
      user: "raw-bob",
    },
    {
      command: "event",
      target: "raw_ada_event",
      parameters: { send_to: MEASUREMENT_ID },
      user: "raw-bob",
    },
    {
      command: "event",
      target: "raw_bob_event",
      parameters: { send_to: MEASUREMENT_ID },
      user: "raw-bob",
    },
  ]);
});

test("through the adapter each event reaches gtag under the user it was tracked for", async () => {
  const { analytics, commands, reached } = await ready;
  const from = commands.length;
  const session = firebase({ sdk: FirebaseAnalytics, analytics, map }).open();

  await session.identify?.({ user: { id: "ada" } });
  session.track(
    createTrackedEvent({ name: "ada_event", properties: { value: 1 } }),
    createContext(),
  );
  await session.identify?.({ user: { id: "bob" } });
  session.track(
    createTrackedEvent({ name: "bob_event", properties: { value: 2 } }),
    createContext(),
  );
  await reached(({ target }) => target === "bob_event");

  expect(commands.slice(from)).toEqual([
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: "ada" },
      user: "ada",
    },
    {
      command: "event",
      target: "ada_event",
      parameters: {
        value: 1,
        event_callback: expect.any(Function),
        send_to: MEASUREMENT_ID,
      },
      user: "ada",
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: "bob" },
      user: "bob",
    },
    {
      command: "event",
      target: "bob_event",
      parameters: {
        value: 2,
        event_callback: expect.any(Function),
        send_to: MEASUREMENT_ID,
      },
      user: "bob",
    },
  ]);
});

test("user properties, their removal and a reset reach gtag as the adapter sent them", async () => {
  const { analytics, commands, reached } = await ready;
  const from = commands.length;
  const session = firebase({ sdk: FirebaseAnalytics, analytics, map }).open();

  session.identify?.({ user: { id: "cy" } });
  session.traits?.({ user: { id: "cy" }, set: { plan: "pro" }, remove: [] });
  session.traits?.({
    user: { id: "cy" },
    set: { seats: 4 },
    remove: ["plan"],
  });
  session.reset?.();
  session.track(createTrackedEvent({ name: "after_reset" }), createContext());
  await reached(({ target }) => target === "after_reset");

  expect(commands.slice(from)).toEqual([
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: "cy" },
      user: "cy",
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_properties: { plan: "pro" } },
      user: "cy",
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_properties: { plan: null, seats: 4 } },
      user: "cy",
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: null },
      user: null,
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: {
        update: true,
        user_properties: { plan: null, seats: null },
      },
      user: null,
    },
    {
      command: "event",
      target: "after_reset",
      parameters: {
        event_callback: expect.any(Function),
        send_to: MEASUREMENT_ID,
      },
      user: null,
    },
  ]);
});

test("collection flips Firebase's own ga-disable switch both ways", async () => {
  const { analytics, reached, page } = await ready;
  const session = firebase({ sdk: FirebaseAnalytics, analytics, map }).open();

  session.collection?.(false);
  session.track(createTrackedEvent({ name: "while_off" }), createContext());
  await reached(({ target }) => target === "while_off");

  expect(page[COLLECTION_SWITCH]).toBe(true);

  session.collection?.(true);
  session.track(createTrackedEvent({ name: "while_on" }), createContext());
  await reached(({ target }) => target === "while_on");

  expect(page[COLLECTION_SWITCH]).toBe(false);
});

test("through Trace, a user switch reaches gtag with each event under the user it was tracked for", async () => {
  const { analytics, commands, reached } = await ready;
  const from = commands.length;

  const trace = new Trace({
    events,
    destinations: {
      product: firebase({ sdk: FirebaseAnalytics, analytics, map }),
    },
    now: () => TIMESTAMP,
  });

  onTestFinished(trace.dispose);
  trace.start();
  trace.user({ id: "dee" });
  trace.track("dee_event", { value: 3 });
  trace.user({ id: "eve" });
  trace.track("eve_event", { value: 4 });
  await reached(({ target }) => target === "eve_event");

  expect(commands.slice(from)).toEqual([
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: "dee" },
      user: "dee",
    },
    {
      command: "event",
      target: "dee_event",
      parameters: {
        value: 3,
        event_callback: expect.any(Function),
        send_to: MEASUREMENT_ID,
      },
      user: "dee",
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: null },
      user: null,
    },
    {
      command: "config",
      target: MEASUREMENT_ID,
      parameters: { update: true, user_id: "eve" },
      user: "eve",
    },
    {
      command: "event",
      target: "eve_event",
      parameters: {
        value: 4,
        event_callback: expect.any(Function),
        send_to: MEASUREMENT_ID,
      },
      user: "eve",
    },
  ]);
});
