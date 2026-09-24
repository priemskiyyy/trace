import { useTraceStatus } from "@priemskiyyy/trace-react";
import type React from "react";

import { dotStyles } from "example-shared/ui/styles/dotStyles";
import { Badge } from "src/components/Badge/Badge";
import { TRACE_STATUS_LABELS } from "src/utils/constants/labels";
import { TRACE_STATUS_TONES } from "src/utils/constants/tones";

export const TraceStatusBadge: React.FunctionComponent = () => {
  const { state } = useTraceStatus();
  const tone = TRACE_STATUS_TONES[state];

  return (
    <Badge tone={tone}>
      <span aria-hidden="true" className={dotStyles({ tone })} />
      {TRACE_STATUS_LABELS[state]}
    </Badge>
  );
};
