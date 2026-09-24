import { useTraceStatus } from "@priemskiyyy/trace-solid";
import type { Component } from "solid-js";

import { TRACE_STATUS_LABELS } from "example-shared/boutique/reporting/constants/labels";
import { TRACE_STATUS_TONES } from "example-shared/ui/constants/tones";
import { dotStyles } from "example-shared/ui/styles/dotStyles";
import { ToneBadge } from "src/components/Badge/ToneBadge";

export const StatusBadge: Component = () => {
  const status = useTraceStatus();
  const tone = () => TRACE_STATUS_TONES[status().state];

  return (
    <ToneBadge tone={tone()}>
      <span aria-hidden="true" class={dotStyles({ tone: tone() })} />
      {TRACE_STATUS_LABELS[status().state]}
    </ToneBadge>
  );
};
