import type {
  GroupUpdate,
  IdentifyUpdate,
  TrackedEvent,
  TraitsUpdate,
} from "@priemskiyyy/trace";

const freeze = <TValue>(value: TValue): TValue => {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }

  return value;
};

/**
 * Frozen values shaped as the core hands them to a session: one event and one
 * update per identity call. They prove how the console maps each value; they
 * do not prove what the core builds, which the tests through a real Trace do.
 */
export const EVENT = freeze<TrackedEvent>({
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
});

export const IDENTIFY = freeze<IdentifyUpdate>({ user: { id: "user_42" } });

export const TRAITS = freeze<TraitsUpdate>({
  user: { id: "user_42" },
  set: { plan: "pro" },
  remove: ["role"],
});

export const GROUP = freeze<GroupUpdate>({
  user: { id: "user_42" },
  group: { type: "workspace", id: "w_1", traits: { tier: "enterprise" } },
});
