import type {
  ConsentDecision,
  DestinationOutcome,
  MappingLoss,
} from "@priemskiyyy/trace";
import type React from "react";

import { DESTINATION_GUIDES } from "example-shared/boutique/reporting/constants/destinations";
import { explainOutcome } from "example-shared/boutique/reporting/explainOutcome";
import { getOutcomeStatus } from "example-shared/boutique/reporting/getOutcomeStatus";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { formatLoss } from "example-shared/formatting/formatLoss";
import { OutcomeBadge } from "src/components/Badge/OutcomeBadge";
import { IconTile } from "src/components/IconTile/IconTile";
import { DESTINATION_ICONS } from "src/utils/constants/icons";

type DestinationOutcomeRowProps = {
  name: BoutiqueDestination;
  outcome: DestinationOutcome | null | undefined;
  consent: ConsentDecision;
  losses: MappingLoss[];
};

export const DestinationOutcomeRow: React.FunctionComponent<
  DestinationOutcomeRowProps
> = ({ name, outcome, consent, losses }) => {
  const guide = DESTINATION_GUIDES[name];

  return (
    <li aria-label={guide.name} className="flex items-start gap-3 py-2.5">
      <IconTile icon={DESTINATION_ICONS[name]} size="small" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{guide.name}</span>
          <OutcomeBadge status={getOutcomeStatus(outcome)} />
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {explainOutcome({ destination: name, outcome, consent })}
        </p>
        {losses.length === 0 ? null : (
          <ul
            aria-label={`${guide.name} losses`}
            className="flex flex-col gap-0.5 font-mono text-xs text-zinc-500"
          >
            {losses.map((loss) => (
              <li key={formatLoss(loss)}>{formatLoss(loss)}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
};
