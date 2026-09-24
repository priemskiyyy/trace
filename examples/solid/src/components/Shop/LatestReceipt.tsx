import type { Component } from "solid-js";
import { Show } from "solid-js";

import { DESTINATION_NAMES } from "example-shared/boutique/reporting/constants/destinations";
import { getReceiptDisplay } from "example-shared/boutique/reporting/getReceiptDisplay";
import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
import { ToneBadge } from "src/components/Badge/ToneBadge";
import { DestinationOutcomeRow } from "src/components/Shop/DestinationOutcomeRow";
import { useObservable } from "src/primitives/useObservable";

type LatestReceiptProps = { tracked: TrackedReceipt };

export const LatestReceipt: Component<LatestReceiptProps> = (props) => {
  const status = useObservable(props.tracked.receipt.status);
  const display = () => getReceiptDisplay(status());

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm text-zinc-500 dark:text-zinc-400">
          {props.tracked.action}
        </span>
        <ToneBadge tone={display().tone}>{display().label}</ToneBadge>
      </div>
      <Show
        when={display().reason !== null}
        fallback={
          <ul
            aria-label="Destinations"
            class="flex flex-col divide-y divide-zinc-200/70 dark:divide-zinc-800"
          >
            {DESTINATION_NAMES.map((name) => (
              <DestinationOutcomeRow
                name={name}
                outcome={display().outcomes[name]}
              />
            ))}
          </ul>
        }
      >
        <p class="text-sm text-zinc-500 dark:text-zinc-400">
          Dropped before it reached any destination: {display().reason}.
        </p>
      </Show>
    </div>
  );
};
