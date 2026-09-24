<script lang="ts">
  import ToneBadge from "src/components/Badge/ToneBadge.svelte";
  import DestinationOutcomeRow from "src/components/Shop/DestinationOutcomeRow.svelte";
  import { useObservable } from "src/utilities/useObservable.svelte";
  import type { TrackedReceipt } from "src/types/TrackedReceipt";
  import { DESTINATION_NAMES } from "src/utils/constants/destinations";
  import { getReceiptDisplay } from "src/utils/getReceiptDisplay";

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
