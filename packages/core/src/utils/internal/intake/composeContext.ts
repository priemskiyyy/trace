import type { Layer } from "src/types/internal/Layer";

export const composeContext = (layers: Layer[]): Layer => {
  const composed: Layer = new Map();

  for (const layer of layers) {
    for (const [key, entry] of layer) {
      if (entry.value === null) {
        composed.delete(key);

        continue;
      }

      composed.set(key, entry);
    }
  }

  return composed;
};
