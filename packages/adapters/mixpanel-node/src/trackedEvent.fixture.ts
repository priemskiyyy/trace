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

export const TRACKED_EVENT = deepFreeze<TrackedEvent>({
  id: "3f0b6f64-6c1e-4d7a-9a4e-2b9c1d3e5f70",
  name: "Checkout Started",
  properties: {},
  context: {},
  identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
  timestamp: 1_767_225_600_000,
});

export const createTrackedEvent = (event: Partial<TrackedEvent> = {}) =>
  deepFreeze<TrackedEvent>({ ...TRACKED_EVENT, ...event });
