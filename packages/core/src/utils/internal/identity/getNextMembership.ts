import type { IdentityGroup } from "src/types/internal/IdentityGroup";
import { getChangedEntries } from "src/utils/internal/identity/getChangedEntries";

export const getNextMembership = (
  held: IdentityGroup | null | undefined,
  group: IdentityGroup | null,
): IdentityGroup | null => {
  if (group === null) {
    return null;
  }

  if (held?.id !== group.id) {
    return Object.freeze({
      id: group.id,
      traits: Object.freeze({ ...group.traits }),
    });
  }

  if (getChangedEntries(held.traits, group.traits).length === 0) {
    return held;
  }

  return Object.freeze({
    id: group.id,
    traits: Object.freeze({ ...held.traits, ...group.traits }),
  });
};
