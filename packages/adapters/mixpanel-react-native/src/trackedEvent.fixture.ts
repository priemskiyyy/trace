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
 * A deep-frozen `TrackedEvent` shaped as the core hands one to a session, and
 * a builder of variants of it, for the tests that call a session directly. It
 * proves nothing about how Trace builds, routes or orders events; the tests
 * through a real `Trace` do.
 */
export const TRACKED_EVENT = deepFreeze<TrackedEvent>({
  id: "5f0c7c2e-2b1d-4c1e-9f3a-8d2b6e4a1c90",
  name: "Checkout Started",
  properties: {},
  context: {},
  identity: { generation: 0, user: null, traits: {}, groups: {} },
  timestamp: Date.UTC(2026, 8, 24, 12),
});

export const createTrackedEvent = (event: Partial<TrackedEvent> = {}) =>
  deepFreeze<TrackedEvent>({ ...TRACKED_EVENT, ...event });
