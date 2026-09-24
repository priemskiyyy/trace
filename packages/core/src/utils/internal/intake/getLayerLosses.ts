import type { Layer } from "src/types/internal/Layer";

export const getLayerLosses = (layer: Layer) =>
  Array.from(layer.values()).flatMap(({ losses }) => losses);
