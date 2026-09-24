import { useTraceStatus } from "@priemskiyyy/trace-react";
import type React from "react";

import { Badge } from "src/components/Badge/Badge";
import { TRACE_STATUS_LABELS } from "src/utils/constants/labels";
import { TRACE_STATUS_TONES } from "src/utils/constants/tones";

export const TraceStatusBadge: React.FunctionComponent = () => {
  const { state } = useTraceStatus();

  return (
    <Badge tone={TRACE_STATUS_TONES[state]}>{TRACE_STATUS_LABELS[state]}</Badge>
  );
};
