<script lang="ts">
  import { DESTINATION_NAMES } from "example-shared/boutique/reporting/constants/destinations";
  import { getReceiptDisplay } from "example-shared/boutique/reporting/getReceiptDisplay";
  import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
  import ToneBadge from "src/components/Badge/ToneBadge.svelte";
  import DestinationOutcomeRow from "src/components/Shop/DestinationOutcomeRow.svelte";
  import { useObservable } from "src/utilities/useObservable.svelte";

  type Props = { tracked: TrackedReceipt };

  let { tracked }: Props = $props();

  const status = useObservable(() => tracked.receipt.status);
  const display = $derived(getReceiptDisplay(status.current));
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="text-sm text-zinc-500 dark:text-zinc-400"
      >{tracked.action}</span
    >
    <ToneBadge tone={display.tone}>{display.label}</ToneBadge>
  </div>
  {#if display.reason !== null}
    <p class="text-sm text-zinc-500 dark:text-zinc-400">
      Dropped before it reached any destination: {display.reason}.
    </p>
  {:else}
    <ul
      aria-label="Destinations"
      class="flex flex-col divide-y divide-zinc-200/70 dark:divide-zinc-800"
    >
      {#each DESTINATION_NAMES as name (name)}
        <DestinationOutcomeRow {name} outcome={display.outcomes[name]} />
      {/each}
    </ul>
  {/if}
</div>
