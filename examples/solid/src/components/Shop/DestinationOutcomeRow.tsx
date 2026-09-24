import type { DestinationOutcome } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-solid";
import type { Component } from "solid-js";
import { Show } from "solid-js";

import { formatLoss } from "example-shared/formatting/formatLoss";
import { formatOutcome } from "example-shared/formatting/formatOutcome";
import { ToneBadge } from "src/components/Badge/ToneBadge";
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

export const DestinationOutcomeRow: Component<DestinationOutcomeRowProps> = (
  props,
) => {
  const status = () => getOutcomeStatus(props.outcome);
  const guide = () => DESTINATION_GUIDES[props.name];
  const losses = () => getLosses(props.outcome);

  return (
    <li aria-label={guide().name} class="flex flex-col gap-1.5 py-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-medium">{guide().name}</span>
        <ToneBadge tone={OUTCOME_TONES[status()]}>
          {OUTCOME_LABELS[status()]}
        </ToneBadge>
      </div>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">
        {formatOutcome(props.outcome)}
      </p>
      <Show when={losses().length > 0}>
        <ul
          aria-label={`${guide().name} losses`}
          class="flex flex-col gap-0.5 font-mono text-xs text-zinc-500"
        >
          {losses().map((loss) => (
            <li>{formatLoss(loss)}</li>
          ))}
        </ul>
      </Show>
    </li>
  );
};
