import type { MappingLoss } from "src/types/MappingLoss";

const getOwner = (keys: Set<string>, root: string, path: string) => {
  const prefix = `${root}.`;

  if (!path.startsWith(prefix)) {
    return null;
  }

  const segments = path.slice(prefix.length).split(".");

  for (let count = segments.length; count > 0; count -= 1) {
    const key = segments.slice(0, count).join(".");

    if (keys.has(key)) {
      return key;
    }
  }

  return null;
};

export const getLossesByKey = (
  keys: string[],
  root: string,
  losses: MappingLoss[],
) => {
  const known = new Set(keys);
  const byKey = new Map<string, MappingLoss[]>();
  const rest: MappingLoss[] = [];

  for (const loss of losses) {
    const owner = getOwner(known, root, loss.path);

    if (owner === null) {
      rest.push(loss);

      continue;
    }

    byKey.set(owner, [...(byKey.get(owner) ?? []), loss]);
  }

  return { byKey, rest };
};
