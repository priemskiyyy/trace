import { describe, expect, test } from "vitest";

import { createMockAdapter } from "src/mock/createMockAdapter";
import type { MockIdentityCall } from "src/mock/types/MockIdentityCall";
import type { AnalyticsConformanceOptions } from "src/testing/types/AnalyticsConformanceOptions";
import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";
import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { TrackContext } from "src/types/TrackContext";
import type { TrackedEvent } from "src/types/TrackedEvent";
import type { TrackResult } from "src/types/TrackResult";
import { assertUnreachable } from "src/utils/common/assertUnreachable";
import { event } from "src/utils/event";
import { copyTrackResult } from "src/utils/internal/destinations/copyTrackResult";
import { Trace } from "src/utils/Trace";
import { TraceError } from "src/utils/TraceError";

const IDENTITY_STEPS = [
  "identify",
  "traits",
  "group",
  "traits",
  "group",
  "reset",
];

const captureFixtures = () => {
  const mock = createMockAdapter();

  const trace = new Trace({
    events: {
      "Conformance Checked": event<{
        cart: { id: string; items: { sku: string; quantity: number }[] };
        value: number;
      }>(),
    },
    destinations: { conformance: mock.adapter },
  });

  trace.start();
  trace.context({ app: { version: "2.4.0" } });
  trace.user({
    id: "conformance-user",
    traits: { plan: "pro", role: "admin" },
  });
  trace.group("workspace", {
    id: "workspace_1",
    traits: { tier: "enterprise" },
  });
  trace.traits({ role: null });
  trace.track(
    "Conformance Checked",
    {
      cart: { id: "cart_1", items: [{ sku: "sku_1", quantity: 2 }] },
      value: 49.5,
    },
    { context: { screen: "checkout" } },
  );
  trace.group("workspace", null);
  trace.user(null);
  trace.dispose();

  const session = mock.sessions[0];
  const tracked = session?.events[0];
  const steps = session?.identity.map(({ kind }) => kind) ?? [];

  if (
    session === undefined ||
    tracked === undefined ||
    steps.join() !== IDENTITY_STEPS.join()
  ) {
    throw new Error(
      `The conformance fixtures were not captured. The core's mock recorded ${session?.events.length ?? 0} tracked and the identity calls [${steps.join(", ")}]; expected 1 tracked and [${IDENTITY_STEPS.join(", ")}].`,
    );
  }

  return { event: tracked, identity: session.identity };
};

const createTrackContext = (tracked: TrackedEvent): TrackContext => ({
  signal: new AbortController().signal,
  currentGeneration: () => tracked.identity.generation,
  now: () => Date.now(),
});

const isTrackResult = (answer: TrackResult) =>
  typeof answer === "object" &&
  answer !== null &&
  (answer.status === "failed" ||
    copyTrackResult(answer, []).status !== "failed");

const isAnsweredWithoutFailing = (answer: TrackResult) =>
  copyTrackResult(answer, []).status !== "failed";

const replay = (session: AnalyticsSession, call: MockIdentityCall) => {
  if (call.kind === "identify") {
    return session.identify?.(Object.freeze({ user: call.user }));
  }

  if (call.kind === "traits") {
    return session.traits?.(
      Object.freeze({ user: call.user, set: call.set, remove: call.remove }),
    );
  }

  if (call.kind === "group") {
    return session.group?.(
      Object.freeze({ user: call.user, group: call.group }),
    );
  }

  if (call.kind === "reset") {
    return session.reset?.();
  }

  return assertUnreachable(call);
};

const getIdentityAnswer = async (call: () => unknown) => {
  try {
    await call();

    return "completed";
  } catch (error) {
    if (error instanceof TraceError && error.code === "UNSUPPORTED") {
      return "unsupported";
    }

    return error;
  }
};

const withSession = async (
  adapter: AnalyticsAdapter,
  run: (session: AnalyticsSession) => unknown,
) => {
  const session = adapter.open();

  try {
    await run(session);
  } finally {
    await session.dispose?.();
  }
};

/**
 * Registers the contract every analytics adapter keeps, over an event and
 * identity updates that a real Trace built for the user `conformance-user`.
 * It cannot see whether the factory is cold, how each field is mapped or what
 * evidence the provider really gives, so each adapter tests those itself.
 *
 * @example
 * ```ts
 * testAnalyticsAdapter({
 *   name: "console",
 *   createAdapter: () => console({ writer: () => {} }),
 * });
 * ```
 */
export const testAnalyticsAdapter = ({
  name,
  createAdapter,
}: AnalyticsConformanceOptions) => {
  // The one describe, a carve-out: a file registers the suite once per adapter shape, and flat names would collide.
  describe(`${name} adapter conformance`, () => {
    test("the adapter names itself and opens on demand", async () => {
      const adapter = createAdapter();

      expect(typeof adapter.name).toBe("string");
      expect(adapter.name).not.toBe("");
      expect(typeof adapter.open).toBe("function");

      await withSession(adapter, (session) => {
        expect(typeof session.track).toBe("function");
      });
    });

    test("the native handle keeps its identity across reads", async () => {
      await withSession(createAdapter(), (session) => {
        expect(session.native).toBe(session.native);
      });
    });

    test("an event is answered without throwing or failing, and left untouched", async () => {
      await withSession(createAdapter(), async (session) => {
        const { event: tracked } = captureFixtures();
        const before = JSON.stringify(tracked);

        const answer = await session.track(
          tracked,
          createTrackContext(tracked),
        );

        expect(answer).toSatisfy(isAnsweredWithoutFailing);
        expect(JSON.stringify(tracked)).toBe(before);
      });
    });

    test("an answer is one of the TrackResult shapes, and submitted evidence is one of the three values", async () => {
      await withSession(createAdapter(), async (session) => {
        const { event: tracked } = captureFixtures();

        const answer = await session.track(
          tracked,
          createTrackContext(tracked),
        );

        expect(answer).toSatisfy(isTrackResult);
      });
    });

    test("every identity method present completes a set, a removal, a group change and a leave, or throws TraceError UNSUPPORTED, and a reset always completes", async ({
      skip,
    }) => {
      await withSession(createAdapter(), async (session) => {
        const { identity } = captureFixtures();

        const present = identity.flatMap((call) => {
          if (typeof session[call.kind] !== "function") {
            return [];
          }

          return [call];
        });

        if (present.length === 0) {
          return skip("the session has no identity method");
        }

        for (const call of present) {
          expect(
            await getIdentityAnswer(() => replay(session, call)),
            call.kind,
          ).toBeOneOf(
            call.kind === "reset"
              ? ["completed"]
              : ["completed", "unsupported"],
          );
        }
      });
    });

    test("collection, where there is one, turns off and on again", async ({
      skip,
    }) => {
      await withSession(createAdapter(), async (session) => {
        if (typeof session.collection !== "function") {
          return skip("the session has no collection switch");
        }

        await expect(
          Promise.resolve(session.collection(false)),
        ).resolves.toBeUndefined();
        await expect(
          Promise.resolve(session.collection(true)),
        ).resolves.toBeUndefined();
      });
    });

    test("flush, where there is one, answers flushed, timeout or failed", async ({
      skip,
    }) => {
      await withSession(createAdapter(), async (session) => {
        if (typeof session.flush !== "function") {
          return skip("the session has no flush");
        }

        const result = await session.flush({
          timeout: 1_000,
          signal: new AbortController().signal,
        });

        expect(result.status).toBeOneOf(["flushed", "timeout", "failed"]);
      });
    });

    test("disposal, where there is one, completes", async ({ skip }) => {
      const session = createAdapter().open();

      if (typeof session.dispose !== "function") {
        return skip("the session has no dispose");
      }

      await expect(Promise.resolve(session.dispose())).resolves.toBeUndefined();
    });

    test("every open yields an independent session", async () => {
      const adapter = createAdapter();
      const first = adapter.open();

      await first.dispose?.();
      await withSession(adapter, async (second) => {
        const { event: tracked } = captureFixtures();

        const answer = await second.track(tracked, createTrackContext(tracked));

        expect(second).not.toBe(first);
        expect(answer).toSatisfy(isAnsweredWithoutFailing);
      });
    });
  });
};
