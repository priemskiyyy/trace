import type { MappingLoss } from "src/types/MappingLoss";

export const getUniqueLosses = (losses: MappingLoss[]) => {
  const seen = new Set<string>();

  return losses.flatMap((loss) => {
    const identity = `${loss.reason} ${loss.path}`;

    if (seen.has(identity)) {
      return [];
    }

    seen.add(identity);

    return [loss];
  });
};
