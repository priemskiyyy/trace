<script setup lang="ts">
import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
import BasePanel from "src/components/BasePanel/BasePanel.vue";
import EmptyState from "src/components/EmptyState/EmptyState.vue";
import LatestReceipt from "src/components/Shop/LatestReceipt.vue";

defineProps<{ tracked: TrackedReceipt | null }>();
</script>

<template>
  <BasePanel
    title="Latest receipt"
    shows="What every destination did with the last event you tracked, with its evidence and losses."
  >
    <EmptyState
      v-if="tracked === null"
      title="Nothing tracked yet"
      description="Add a product to the cart and check out to see a receipt."
    />
    <LatestReceipt v-else :key="tracked.receipt.id" :tracked="tracked" />
  </BasePanel>
</template>
