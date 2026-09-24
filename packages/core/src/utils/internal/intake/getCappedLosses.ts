import type { MappingLoss } from "src/types/MappingLoss";
import { getUniqueLosses } from "src/utils/internal/intake/getUniqueLosses";

export const getCappedLosses = (
  losses: MappingLoss[],
  root: string,
  breadth: number,
) => {
  const unique = getUniqueLosses(losses);
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
