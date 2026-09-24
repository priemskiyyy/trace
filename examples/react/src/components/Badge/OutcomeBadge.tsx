import type React from "react";

import { OUTCOME_LABELS } from "example-shared/boutique/reporting/constants/labels";
import type { OutcomeStatus } from "example-shared/boutique/reporting/types/OutcomeStatus";
import { OUTCOME_TONES } from "example-shared/ui/constants/tones";
import { Badge } from "src/components/Badge/Badge";
import { OutcomeIcon } from "src/components/Badge/OutcomeIcon";

type OutcomeBadgeProps = { status: OutcomeStatus };

export const OutcomeBadge: React.FunctionComponent<OutcomeBadgeProps> = ({
  status,
}) => (
  <Badge tone={OUTCOME_TONES[status]}>
    <OutcomeIcon status={status} />
    {OUTCOME_LABELS[status]}
  </Badge>
);
