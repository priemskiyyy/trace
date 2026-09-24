import type { TrackedEvent } from "src/types/TrackedEvent";
import type { IdentityGroup } from "src/types/internal/IdentityGroup";
import type { IdentityTarget } from "src/types/internal/IdentityTarget";
import type { UserChange } from "src/types/internal/UserChange";
import { getOwnValue } from "src/utils/common/getOwnValue";
import { getChangedEntries } from "src/utils/internal/identity/getChangedEntries";
import { getNextMembership } from "src/utils/internal/identity/getNextMembership";

const withoutTombstones = (record: Record<string, unknown>) =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(record).filter(([, value]) => value !== null),
    ),
  );

const getSnapshot = (target: IdentityTarget): TrackedEvent["identity"] => {
  const groups = Object.entries(target.groups).flatMap(
    ([type, group]): [string, IdentityGroup][] =>
      group === null
        ? []
        : [
            [
              type,
              Object.freeze({
                id: group.id,
                traits: withoutTombstones(group.traits),
              }),
            ],
          ],
  );

  return Object.freeze({
    generation: target.generation,
    user: target.user,
    traits: withoutTombstones(target.traits),
    groups: Object.freeze(Object.fromEntries(groups)),
  });
};

export class IdentityState {
  #target: IdentityTarget = Object.freeze({
    generation: 0,
    user: null,
    traits: Object.freeze({}),
    groups: Object.freeze({}),
  });

  #snapshot: {
    target: IdentityTarget;
    value: TrackedEvent["identity"];
  } | null = null;

  target = () => this.#target;

  snapshot = () => {
    const target = this.#target;

    if (this.#snapshot === null || this.#snapshot.target !== target) {
      this.#snapshot = { target, value: getSnapshot(target) };
    }

    return this.#snapshot.value;
  };

  setUser = (user: { id: string } | null): UserChange => {
    const current = this.#target;

    if (current.user?.id === user?.id) {
      return { kind: "UNCHANGED" };
    }

    const ended = current.user !== null;

    this.#target = Object.freeze({
      generation: current.generation + 1,
      user: user === null ? null : Object.freeze({ id: user.id }),
      traits: ended ? Object.freeze({}) : current.traits,
      groups: ended ? Object.freeze({}) : current.groups,
    });

    return { kind: "CHANGED", ended };
  };

  setTraits = (traits: Record<string, unknown>) => {
    const current = this.#target;

    if (getChangedEntries(current.traits, traits).length === 0) {
      return;
    }

    this.#target = Object.freeze({
      ...current,
      traits: Object.freeze({ ...current.traits, ...traits }),
    });
  };

  setGroup = (type: string, group: IdentityGroup | null) => {
    const current = this.#target;
    const held = getOwnValue(current.groups, type);
    const next = getNextMembership(held, group);

    if (next === held) {
      return;
    }

    this.#target = Object.freeze({
      ...current,
      groups: Object.freeze({ ...current.groups, [type]: next }),
    });
  };
}
