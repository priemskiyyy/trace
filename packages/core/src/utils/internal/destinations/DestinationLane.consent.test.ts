import { expect, test, vi } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import { createDeferred } from "src/utils/common/createDeferred";
import { createLane } from "src/utils/internal/destinations/createLane.fixture";

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

const ADA: IdentityTarget = {
  generation: 1,
  user: { id: "ada" },
  traits: {},
  groups: {},
};

const ADA_PRO: IdentityTarget = { ...ADA, traits: { plan: "pro" } };

const SUBMITTED: DestinationOutcome = {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
};

const CONSENT: DestinationOutcome = { status: "dropped", reason: "consent" };

test("collection is switched off at open while closed, on when opened, off when closed again", () => {
  const { lane, mock, log, setConsent } = createLane({
    gated: true,
    consent: false,
  });

  lane.start();

  expect(mock.sessions[0]?.collection).toEqual([false]);

  setConsent(true);

  expect(mock.sessions[0]?.collection).toEqual([false, true]);

  setConsent(false);

  expect(mock.sessions[0]?.collection).toEqual([false, true, false]);
  expect(log).toEqual([
    "open",
    "collection false",
    "collection true",
    "collection false",
  ]);
});

test("a gated lane that opens while consent is open switches collection on before anything else", () => {
  const { lane, log, enqueue } = createLane({ gated: true });

  enqueue("buffered");
  lane.status.subscribe(() => {
    log.push(`status ${lane.status.get().state}`);
  });
  lane.start();

  expect(log).toEqual([
    "open",
    "collection true",
    "status ready",
    "track buffered",
  ]);
});

test("a gated lane that opens while consent is closed switches collection off before anything else", () => {
  const { lane, log } = createLane({ gated: true, consent: false });

  lane.status.subscribe(() => {
    log.push(`status ${lane.status.get().state}`);
  });
  lane.start();

  expect(log).toEqual(["open", "collection false", "status ready"]);
});

test("a lane that consent does not gate never switches collection, at open or later", () => {
  const { lane, log, setConsent } = createLane({ consent: false });

  lane.start();
  setConsent(true);
  setConsent(false);

  expect(log).toEqual(["open"]);
});

test("a gated lane that hears consent did not change calls nothing more", () => {
  const { lane, log, setConsent } = createLane({ gated: true });

  lane.start();
  lane.consentChanged();
  setConsent(true);

  expect(log).toEqual(["open", "collection true"]);
});

test("closing drops what waits for an idle lane as consent, and calls nothing", () => {
  const { lane, log, enqueue, outcomes, setConsent } = createLane({
    gated: true,
  });

  enqueue("first");
  enqueue("second");
  setConsent(false);
  setConsent(true);

  expect(outcomes.get("first")).toEqual([CONSENT]);
  expect(outcomes.get("second")).toEqual([CONSENT]);
  expect(lane.buffered()).toBe(0);
  expect(log).toEqual([]);

  lane.start();

  expect(log).toEqual(["open", "collection true"]);
});

test("closing drops what waits behind an identity step as consent and switches collection off", async () => {
  const step = createDeferred<void>();

  const { lane, log, enqueue, outcomes, setConsent, setIdentity } = createLane({
    gated: true,
    mock: { onIdentity: () => step.promise },
  });

  lane.start();
  setIdentity(ADA);
  enqueue("preparing", ADA);
  enqueue("behind", ADA);
  setConsent(false);

  expect(outcomes.get("preparing")).toEqual([CONSENT]);
  expect(outcomes.get("behind")).toEqual([CONSENT]);
  expect(lane.buffered()).toBe(0);

  step.resolve();
  await nextMacrotask();

  expect(log).toEqual([
    "open",
    "collection true",
    "identify ada",
    "collection false",
  ]);
});

test("a revocation between acceptance and handoff wins at the check before the handoff", async () => {
  const step = createDeferred<void>();

  const {
    lane,
    log,
    enqueue,
    outcomes,
    landed,
    setConsentSilently,
    setIdentity,
  } = createLane({ mock: { onIdentity: () => step.promise } });

  lane.start();
  setIdentity(ADA);
  enqueue("waiting", ADA);
  setConsentSilently(false);
  step.resolve();
  await landed("waiting");

  expect(outcomes.get("waiting")).toEqual([CONSENT]);
  expect(log).toEqual(["open", "identify ada"]);
});

test("no identity step reaches a destination whose consent closed while its pass ran", async () => {
  const step = createDeferred<void>();

  const {
    lane,
    log,
    enqueue,
    outcomes,
    landed,
    setConsentSilently,
    setIdentity,
  } = createLane({
    mock: {
      onIdentity: (call) =>
        call.kind === "identify" ? step.promise : undefined,
    },
  });

  lane.start();
  setIdentity(ADA_PRO);
  enqueue("waiting", ADA_PRO);
  setConsentSilently(false);
  step.resolve();
  await landed("waiting");

  expect(log).toEqual(["open", "identify ada"]);
  expect(outcomes.get("waiting")).toEqual([CONSENT]);
});

test("a revocation and a new grant while a step is in flight leave the applied state unknown, so the next pass resets", async () => {
  const step = createDeferred<void>();

  const { lane, log, enqueue, outcomes, setConsent, setIdentity } = createLane({
    mock: {
      onIdentity: (call) =>
        call.kind === "identify" ? step.promise : undefined,
    },
  });

  lane.start();
  setIdentity(ADA_PRO);
  enqueue("waiting", ADA_PRO);
  setConsent(false);
  setConsent(true);
  step.resolve();
  await nextMacrotask();

  expect(outcomes.get("waiting")).toEqual([CONSENT]);
  expect(log).toEqual([
    "open",
    "identify ada",
    "reset",
    "identify ada",
    "traits",
  ]);
});

test("a closed lane runs no identity passes, and opening switches collection on and then plans against the current identity", () => {
  const { lane, log, setConsent, setIdentity } = createLane({
    gated: true,
    consent: false,
    identity: ADA,
  });

  lane.start();
  lane.identityChanged();
  setIdentity(ADA_PRO);
  lane.identityChanged();

  expect(log).toEqual(["open", "collection false"]);

  setConsent(true);

  expect(log).toEqual([
    "open",
    "collection false",
    "collection true",
    "identify ada",
    "traits",
  ]);
});

test("an entry that reaches a closed lane is dropped as consent before any identity step", () => {
  const { lane, log, enqueue, outcomes } = createLane({
    gated: true,
    consent: false,
  });

  lane.start();
  enqueue("unexpected", ADA);

  expect(outcomes.get("unexpected")).toEqual([CONSENT]);
  expect(log).toEqual(["open", "collection false"]);
});

test("a collection switch that throws or rejects is contained, and consent still gates the lane", async () => {
  const unhandled = vi.fn();

  process.on("unhandledRejection", unhandled);

  const mock = createMockAdapter();

  const adapter: AnalyticsAdapter = {
    name: "stubborn",
    open: () => ({
      ...mock.adapter.open(),
      collection: (enabled) => {
        if (enabled) {
          return Promise.reject(new Error("the SDK cannot resume"));
        }

        throw new Error("the SDK cannot pause");
      },
    }),
  };

  const { lane, log, records, enqueue, outcomes, setConsent, setIdentity } =
    createLane({ adapter, gated: true, consent: false });

  expect(() => lane.start()).not.toThrow();

  setIdentity(ADA);

  expect(() => setConsent(true)).not.toThrow();

  enqueue("after", ADA);
  await nextMacrotask();
  process.off("unhandledRejection", unhandled);

  expect(unhandled).not.toHaveBeenCalled();
  expect(mock.sessions[0]?.identity).toEqual([
    { kind: "identify", user: { id: "ada" } },
  ]);
  expect(outcomes.get("after")).toEqual([SUBMITTED]);
  expect(lane.status.get()).toEqual({ state: "ready" });
  expect(log).toEqual([
    "open",
    "collection false",
    "collection true",
    "identify ada",
    "track after",
  ]);
  expect(
    records.filter((record) => record.type === "destination collection failed"),
  ).toStrictEqual([
    {
      source: "destination",
      type: "destination collection failed",
      destination: "product",
      event: null,
      context: { enabled: false },
    },
    {
      source: "destination",
      type: "destination collection failed",
      destination: "product",
      event: null,
      context: { enabled: true },
    },
  ]);
  expect(JSON.stringify(records)).not.toContain("the SDK cannot");
});
