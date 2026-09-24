import type { Layer } from "src/types/internal/Layer";
import type { MappingLoss } from "src/types/MappingLoss";

export const keepLosses = (kept: Map<string, MappingLoss[]>, layer: Layer) => {
  for (const [key, { losses }] of layer) {
    if (losses.length === 0) {
      kept.delete(key);

      continue;
    }

    kept.set(key, losses);
  }
};
