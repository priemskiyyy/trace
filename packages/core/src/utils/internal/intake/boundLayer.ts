import type { Layer } from "src/types/internal/Layer";
import type { TraceLimits } from "src/types/TraceLimits";
import { getOwnValue } from "src/utils/common/getOwnValue";
import { getCappedLosses } from "src/utils/internal/intake/getCappedLosses";
import { getLossesByKey } from "src/utils/internal/intake/getLossesByKey";
import { sanitizeValue } from "src/utils/internal/privacy/sanitizeValue";

const keepEveryKey = () => false;

export const boundLayer = ({
  held,
  layer,
  root,
  limits,
}: {
  held: Record<string, unknown>;
  layer: Layer;
  root: string;
  limits: TraceLimits;
}): Layer => {
  const kept = new Map(Object.entries(held));
  const result: Layer = new Map(layer);

  for (const [key, { value }] of layer) {
    if (value === null) {
      kept.delete(key);
    }
  }

  for (const [key, { value, losses }] of layer) {
    if (value === null || value === undefined) {
      continue;
    }

    const trial = new Map(kept);

    trial.delete(key);
    trial.set(key, value);

    const bounded = sanitizeValue(
      Object.fromEntries(trial),
      { redact: keepEveryKey, limits },
      root,
    );

    const fitted = getOwnValue(bounded.value, key);
    const { byKey, rest } = getLossesByKey([key], root, bounded.losses);

    if (fitted !== undefined) {
      kept.set(key, fitted);
    }

    result.set(
      key,
      Object.freeze({
        value: fitted,
        losses: getCappedLosses(
          [...losses, ...(byKey.get(key) ?? rest)],
          root,
          limits.breadth,
        ),
      }),
    );
  }

  return result;
};
