<script lang="ts">
  import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
  import BasePanel from "src/components/BasePanel/BasePanel.svelte";
  import EmptyState from "src/components/EmptyState/EmptyState.svelte";
  import LatestReceipt from "src/components/Shop/LatestReceipt.svelte";

  type Props = { tracked: TrackedReceipt | null };

  let { tracked }: Props = $props();
</script>

<BasePanel
  title="Latest receipt"
  shows="What every destination did with the last event you tracked, with its evidence and losses."
>
  {#if tracked === null}
    <EmptyState
      title="Nothing tracked yet"
      description="Add a product to the cart and check out to see a receipt."
    />
  {:else}
    {#key tracked.receipt.id}
      <LatestReceipt {tracked} />
    {/key}
  {/if}
</BasePanel>
