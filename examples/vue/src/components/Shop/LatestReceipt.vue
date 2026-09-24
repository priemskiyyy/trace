<script setup lang="ts">
import { computed } from "vue";

import ToneBadge from "src/components/Badge/ToneBadge.vue";
import DestinationOutcomeRow from "src/components/Shop/DestinationOutcomeRow.vue";
import { useObservable } from "src/composables/useObservable";
import type { TrackedReceipt } from "src/types/TrackedReceipt";
import { DESTINATION_NAMES } from "src/utils/constants/destinations";
import { getReceiptDisplay } from "src/utils/getReceiptDisplay";

const props = defineProps<{ tracked: TrackedReceipt }>();

const status = useObservable(props.tracked.receipt.status);
const display = computed(() => getReceiptDisplay(status.value));
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm text-zinc-500 dark:text-zinc-400">{{
        tracked.action
      }}</span>
      <ToneBadge :tone="display.tone">{{ display.label }}</ToneBadge>
    </div>
    <p
      v-if="display.reason !== null"
      class="text-sm text-zinc-500 dark:text-zinc-400"
    >
      Dropped before it reached any destination: {{ display.reason }}.
    </p>
    <ul
      v-else
      aria-label="Destinations"
      class="flex flex-col divide-y divide-zinc-200/70 dark:divide-zinc-800"
    >
      <DestinationOutcomeRow
        v-for="name in DESTINATION_NAMES"
        :key="name"
        :name="name"
        :outcome="display.outcomes[name]"
      />
    </ul>
  </div>
</template>
