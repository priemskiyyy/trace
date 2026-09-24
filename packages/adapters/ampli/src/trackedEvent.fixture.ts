import type { TrackedEvent } from "@priemskiyyy/trace";

const deepFreeze = <TValue>(value: TValue): TValue => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  Object.freeze(value);

  return value;
};

/**
 * A deep-frozen `TrackedEvent` shaped as the core hands one to a session, for
 * the tests that call a session or a helper directly. It proves nothing about
 * how Trace builds, routes or orders events; the tests through a real `Trace`
 * do.
 */
export const createTrackedEvent = (event: Partial<TrackedEvent> = {}) =>
  deepFreeze<TrackedEvent>({
    id: "0b0e7a52-9c1d-4f6e-8a3b-1c2d3e4f5a6b",
    name: "Checkout Started",
    properties: { cartId: "cart_1", value: 49.5 },
    context: {},
    identity: {
      generation: 1,
      user: { id: "user_42" },
      traits: {},
      groups: {},
    },
    timestamp: 1_767_225_600_000,
    ...event,
  });
