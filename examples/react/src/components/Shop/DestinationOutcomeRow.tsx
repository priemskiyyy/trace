import type { DestinationOutcome } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import type React from "react";

import { formatLoss } from "example-shared/formatting/formatLoss";
import { formatOutcome } from "example-shared/formatting/formatOutcome";
import { Badge } from "src/components/Badge/Badge";
import { DESTINATION_GUIDES } from "src/utils/constants/destinations";
import { OUTCOME_LABELS } from "src/utils/constants/labels";
import { OUTCOME_TONES } from "src/utils/constants/tones";
import { getOutcomeStatus } from "src/utils/getOutcomeStatus";

type DestinationOutcomeRowProps = {
  name: RegisteredDestinationName;
  outcome: DestinationOutcome | null | undefined;
};

const getLosses = (outcome: DestinationOutcome | null | undefined) => {
  if (outcome === null || outcome === undefined) {
    return [];
  }

  if (outcome.status === "submitted") {
    return outcome.losses;
  }

  if (outcome.status === "dropped" && outcome.reason === "provider-filtered") {
    return outcome.losses;
  }

  return [];
};

export const DestinationOutcomeRow: React.FunctionComponent<
  DestinationOutcomeRowProps
> = ({ name, outcome }) => {
  const status = getOutcomeStatus(outcome);
  const losses = getLosses(outcome);
  const guide = DESTINATION_GUIDES[name];

  return (
    <li aria-label={guide.name} className="flex flex-col gap-1.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{guide.name}</span>
        <Badge tone={OUTCOME_TONES[status]}>{OUTCOME_LABELS[status]}</Badge>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {formatOutcome(outcome)}
      </p>
      {losses.length === 0 ? null : (
        <ul
          aria-label={`${guide.name} losses`}
          className="flex flex-col gap-0.5 font-mono text-xs text-zinc-500"
        >
          {losses.map((loss) => (
            <li key={`${loss.path}-${loss.reason}`}>{formatLoss(loss)}</li>
          ))}
        </ul>
      )}
    </li>
  );
};
