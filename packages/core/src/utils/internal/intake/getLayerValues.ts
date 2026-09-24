import type { Layer } from "src/types/internal/Layer";

export const getLayerValues = (layer: Layer): Record<string, unknown> =>
  Object.fromEntries(
    Array.from(layer).flatMap(([key, { value }]): [string, unknown][] => {
      if (value === undefined) {
        return [];
      }

      return [[key, value]];
    }),
  );
