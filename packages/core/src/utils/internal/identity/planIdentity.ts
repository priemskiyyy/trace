import type { IdentityGroup } from "src/types/internal/IdentityGroup";
import type { IdentityStep } from "src/types/internal/IdentityStep";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import type { SessionIdentityMethods } from "src/types/internal/SessionIdentityMethods";
import { getOwnValue } from "src/utils/common/getOwnValue";
import { getChangedEntries } from "src/utils/internal/identity/getChangedEntries";
import { getNextMembership } from "src/utils/internal/identity/getNextMembership";

const getStartingPoint = (
  applied: IdentityTarget | null,
  target: IdentityTarget,
  session: SessionIdentityMethods,
) => {
  const blank: IdentityTarget = {
    generation: target.generation,
    user: null,
    traits: {},
    groups: {},
  };

  if (applied === null) {
    return { reset: session.reset, base: blank };
  }

  if (session.reset && applied.user === null) {
    const gap = target.generation - applied.generation;

    if (gap === 0 || gap === 1) {
      return { reset: false, base: applied };
    }

    return { reset: true, base: blank };
  }

  if (
    applied.user?.id === target.user?.id &&
    applied.generation === target.generation
  ) {
    return { reset: false, base: applied };
  }

  return { reset: session.reset, base: blank };
};

export const planIdentity = (
  applied: IdentityTarget | null,
  target: IdentityTarget,
  session: SessionIdentityMethods,
): { steps: IdentityStep[]; next: IdentityTarget } => {
  const { reset, base } = getStartingPoint(applied, target, session);

  const user =
    target.user === null ? null : Object.freeze({ id: target.user.id });

  const changedTraits = getChangedEntries(base.traits, target.traits);
  const steps: IdentityStep[] = [];

  if (reset) {
    steps.push(Object.freeze({ kind: "reset" }));
  }

  if (session.identify && user !== null && base.user?.id !== user.id) {
    steps.push(Object.freeze({ kind: "identify", user }));
  }

  if (session.traits && changedTraits.length > 0) {
    const remove = changedTraits.flatMap(([key, value]) => {
      if (value !== null) {
        return [];
      }

      return [key];
    });

    Object.freeze(remove);
    steps.push(
      Object.freeze({
        kind: "traits",
        user,
        set: Object.freeze(
          Object.fromEntries(
            changedTraits.filter(([, value]) => value !== null),
          ),
        ),
        remove,
      }),
    );
  }

  const memberships = session.group ? Object.entries(target.groups) : [];

  for (const [type, group] of memberships) {
    const held = getOwnValue(base.groups, type);

    if (getNextMembership(held, group) === held) {
      continue;
    }

    const update =
      group === null
        ? { type, id: null, traits: Object.freeze({}) }
        : { type, id: group.id, traits: Object.freeze({ ...group.traits }) };

    steps.push(
      Object.freeze({ kind: "group", user, group: Object.freeze(update) }),
    );
  }

  Object.freeze(steps);

  const nextGroups = Object.entries({ ...base.groups, ...target.groups }).map(
    ([type, group]): [string, IdentityGroup | null] => {
      const membership = getNextMembership(
        getOwnValue(base.groups, type),
        group,
      );

      return [
        type,
        membership === null
          ? null
          : Object.freeze({
              id: membership.id,
              traits: Object.freeze({ ...membership.traits }),
            }),
      ];
    },
  );

  return Object.freeze({
    steps,
    next: Object.freeze({
      generation: target.generation,
      user,
      traits: Object.freeze({ ...base.traits, ...target.traits }),
      groups: Object.freeze(Object.fromEntries(nextGroups)),
    }),
  });
};
