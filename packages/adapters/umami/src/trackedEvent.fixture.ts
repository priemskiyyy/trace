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

export const createTrackedEvent = (event: Partial<TrackedEvent> = {}) =>
  deepFreeze<TrackedEvent>({
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    name: "Checkout Started",
    properties: {},
    context: {},
    identity: { generation: 1, user: { id: "ada" }, traits: {}, groups: {} },
    timestamp: 1_767_225_600_000,
    ...event,
  });
