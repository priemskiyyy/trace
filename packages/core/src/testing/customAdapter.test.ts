import { expect, expectTypeOf, test } from "vitest";

// Keep adapter construction on public exports to catch gaps in the authoring API.
import { event, Trace, TraceError } from "src/index";
import type {
  AnalyticsAdapter,
  AnalyticsSession,
  MappingLoss,
  TrackResult,
} from "src/index";
import { testAnalyticsAdapter } from "src/testing";

type BeaconLike = {
  ready: boolean;
  send: (payload: {
    id: string;
    name: string;
    properties: Record<string, unknown>;
    timestamp: number;
  }) => void;
  identify: (id: string) => void;
  setTraits: (traits: Record<string, unknown>) => void;
  unsetTraits: (keys: string[]) => void;
  reset: () => void;
  setEnabled: (enabled: boolean) => void;
  flush: () => Promise<void>;
};

const createBeacon = () => {
  const calls: unknown[][] = [];

  const sdk: BeaconLike = {
    ready: true,
    send: (payload) => {
      calls.push(["send", payload]);
    },
    identify: (id) => {
      calls.push(["identify", id]);
    },
    setTraits: (traits) => {
      calls.push(["setTraits", traits]);
    },
    unsetTraits: (keys) => {
      calls.push(["unsetTraits", keys]);
    },
    reset: () => {
      calls.push(["reset"]);
    },
    setEnabled: (enabled) => {
      calls.push(["setEnabled", enabled]);
    },
    flush: async () => {
      calls.push(["flush"]);
    },
  };

  return { sdk, calls };
};

const beacon = ({
  sdk,
}: {
  sdk: BeaconLike;
}): AnalyticsAdapter<BeaconLike> => ({
  name: "beacon",
  open: (): AnalyticsSession<BeaconLike> => {
    if (!sdk.ready) {
      throw new TraceError({
        code: "NOT_INITIALIZED",
        message: "The beacon is not ready yet.",
      });
    }

    return {
      native: sdk,
      track: (tracked): TrackResult => {
        const losses = Object.keys(tracked.context).flatMap(
          (key): MappingLoss[] => {
            if (!Object.hasOwn(tracked.properties, key)) {
              return [];
            }

            return [{ path: `context.${key}`, reason: "omitted" }];
          },
        );

        sdk.send({
          id: tracked.id,
          name: tracked.name,
          properties: { ...tracked.context, ...tracked.properties },
          timestamp: tracked.timestamp,
        });

        return { status: "submitted", evidence: "sdk-call-returned", losses };
      },
      identify: ({ user }) => sdk.identify(user.id),
      traits: ({ set, remove }) => {
        sdk.setTraits(set);
        sdk.unsetTraits(remove);
      },
      group: () => {
        throw new TraceError({
          code: "UNSUPPORTED",
          message: "The beacon has no groups.",
        });
      },
      reset: () => sdk.reset(),
      collection: (enabled) => sdk.setEnabled(enabled),
      flush: async () => {
        await sdk.flush();

        return { status: "flushed" };
      },
    };
  },
});

const events = {
  "Checkout Started": event<{ cart: { id: string }; screen: string }>(),
};

testAnalyticsAdapter({
  name: "hand-written beacon",
  createAdapter: () => beacon({ sdk: createBeacon().sdk }),
});

test("an adapter written from the public exports alone works through a Trace like any other", async () => {
  const { sdk, calls } = createBeacon();

  const trace = new Trace({
    events,
    destinations: { beacon: beacon({ sdk }) },
    defaults: { context: { screen: "home", app: "2.4.0" } },
    now: () => 1_000,
  });

  trace.start();
  trace.user({ id: "ada", traits: { plan: "pro" } });

  const receipt = trace.track("Checkout Started", {
    cart: { id: "c_1" },
    screen: "cart",
  });

  await expect(receipt.settled).resolves.toEqual({
    state: "settled",
    outcomes: {
      beacon: {
        status: "submitted",
        evidence: "sdk-call-returned",
        event: null,
        losses: [{ path: "context.screen", reason: "omitted" }],
      },
    },
  });
  await expect(trace.flush()).resolves.toEqual({
    drained: true,
    destinations: { beacon: { status: "flushed" } },
  });
  expect(calls).toEqual([
    ["identify", "ada"],
    ["setTraits", { plan: "pro" }],
    ["unsetTraits", []],
    [
      "send",
      {
        id: receipt.id,
        name: "Checkout Started",
        properties: { screen: "cart", app: "2.4.0", cart: { id: "c_1" } },
        timestamp: 1_000,
      },
    ],
    ["flush"],
  ]);
  expectTypeOf(
    trace.destination("beacon").native,
  ).toEqualTypeOf<BeaconLike | null>();
  expect(trace.destination("beacon").native).toBe(sdk);
});

test("an adapter whose SDK is not ready fails its start with NOT_INITIALIZED, and the next start opens it", () => {
  const { sdk } = createBeacon();

  const trace = new Trace({
    events,
    destinations: { beacon: beacon({ sdk }) },
  });

  sdk.ready = false;
  trace.start();

  expect(trace.destination("beacon").status.get()).toEqual({
    state: "failed",
    error: expect.objectContaining({
      name: "TraceError",
      code: "NOT_INITIALIZED",
    }),
  });

  sdk.ready = true;
  trace.start();

  expect(trace.destination("beacon").status.get()).toEqual({ state: "ready" });
});
