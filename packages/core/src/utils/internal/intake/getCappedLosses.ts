import type { MappingLoss } from "src/types/MappingLoss";

export const getCappedLosses = (
  losses: MappingLoss[],
  root: string,
  breadth: number,
) => {
  const seen = new Set<string>();

  const unique = losses.flatMap((loss) => {
    const identity = `${loss.reason} ${loss.path}`;

    if (seen.has(identity)) {
      return [];
    }

    seen.add(identity);

    return [loss];
  });

  const capped = unique.slice(0, breadth);

  const marked = capped.some(
    ({ path, reason }) => path === root && reason === "truncated",
  );

  if (unique.length > breadth && !marked) {
    capped.push(Object.freeze({ path: root, reason: "truncated" }));
  }

  Object.freeze(capped);

  return capped;
};
