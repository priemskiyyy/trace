import { useTraceStatus } from "@priemskiyyy/trace-react";
import type React from "react";

import { TRACE_STATUS_LABELS } from "example-shared/boutique/reporting/constants/labels";
import { TRACE_STATUS_TONES } from "example-shared/ui/constants/tones";
import { Badge } from "src/components/Badge/Badge";

export const TraceStatusBadge: React.FunctionComponent = () => {
  const { state } = useTraceStatus();

  return (
    <Badge tone={TRACE_STATUS_TONES[state]}>{TRACE_STATUS_LABELS[state]}</Badge>
  );
};
