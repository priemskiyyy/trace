import type { PrivacyPolicy } from "src/types/internal/PrivacyPolicy";
import type { MappingLoss } from "src/types/MappingLoss";
import { composeContext } from "src/utils/internal/intake/composeContext";
import { getCappedLosses } from "src/utils/internal/intake/getCappedLosses";
import { getLayerLosses } from "src/utils/internal/intake/getLayerLosses";
import { getLayerValues } from "src/utils/internal/intake/getLayerValues";
import { prepareLayer } from "src/utils/internal/intake/prepareLayer";
import { sanitizeValue } from "src/utils/internal/privacy/sanitizeValue";

type Prepared =
  | { kind: "FAILED" }
  | {
      kind: "PREPARED";
      properties: Record<string, unknown>;
      context: Record<string, unknown>;
      losses: MappingLoss[];
    };

const keepEveryKey = () => false;

export const prepareEvent = ({
  properties,
  layers,
  context,
  policy,
}: {
  properties: Record<string, unknown>;
  layers: ReturnType<typeof prepareLayer>[];
  context: unknown;
  policy: PrivacyPolicy;
}): Prepared => {
  try {
    const sanitized = sanitizeValue(properties, policy, "properties");

    const prepared = [
      ...layers,
      prepareLayer(context, { root: "context", policy }),
    ];

    const composed = composeContext(prepared.map(({ layer }) => layer));

    const bounded = sanitizeValue(
      getLayerValues(composed),
      { redact: keepEveryKey, limits: policy.limits },
      "context",
    );

    const invalid = prepared.flatMap(({ refused }) =>
      refused.map((path): MappingLoss =>
        Object.freeze({ path, reason: "invalid" }),
      ),
    );

    const losses = [
      ...sanitized.losses,
      ...getCappedLosses(
        [...invalid, ...getLayerLosses(composed), ...bounded.losses],
        "context",
        policy.limits.breadth,
      ),
    ];

    Object.freeze(losses);

    return {
      kind: "PREPARED",
      properties: sanitized.value,
      context: bounded.value,
      losses,
    };
  } catch {
    return { kind: "FAILED" };
  }
};
