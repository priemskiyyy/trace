<script lang="ts">
  import type { DestinationOutcome } from "@priemskiyyy/trace";
  import { DESTINATION_GUIDES } from "example-shared/boutique/reporting/constants/destinations";
  import { OUTCOME_LABELS } from "example-shared/boutique/reporting/constants/labels";
  import { getOutcomeStatus } from "example-shared/boutique/reporting/getOutcomeStatus";
  import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
  import { formatLoss } from "example-shared/formatting/formatLoss";
  import { formatOutcome } from "example-shared/formatting/formatOutcome";
  import { OUTCOME_TONES } from "example-shared/ui/constants/tones";
  import ToneBadge from "src/components/Badge/ToneBadge.svelte";

  type Props = {
    name: BoutiqueDestination;
    outcome: DestinationOutcome | null | undefined;
  };

  let { name, outcome }: Props = $props();

  const getLosses = (current: DestinationOutcome | null | undefined) => {
    if (current === null || current === undefined) {
      return [];
    }

    if (current.status === "submitted") {
      return current.losses;
    }

    if (
      current.status === "dropped" &&
      current.reason === "provider-filtered"
    ) {
      return current.losses;
    }

    return [];
  };

  const status = $derived(getOutcomeStatus(outcome));
  const guide = $derived(DESTINATION_GUIDES[name]);
  const text = $derived(formatOutcome(outcome));
  const losses = $derived(getLosses(outcome));
</script>

<li aria-label={guide.name} class="flex flex-col gap-1.5 py-2.5">
  <div class="flex flex-wrap items-center gap-2">
    <span class="font-medium">{guide.name}</span>
    <ToneBadge tone={OUTCOME_TONES[status]}>{OUTCOME_LABELS[status]}</ToneBadge>
  </div>
  <p class="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
  {#if losses.length > 0}
    <ul
      aria-label="{guide.name} losses"
      class="flex flex-col gap-0.5 font-mono text-xs text-zinc-500"
    >
      {#each losses as loss, index (index)}
        <li>{formatLoss(loss)}</li>
      {/each}
    </ul>
  {/if}
</li>
