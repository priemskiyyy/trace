<script setup lang="ts">
import type { DestinationOutcome } from "@priemskiyyy/trace";
import { computed } from "vue";

import { DESTINATION_GUIDES } from "example-shared/boutique/reporting/constants/destinations";
import { OUTCOME_LABELS } from "example-shared/boutique/reporting/constants/labels";
import { getOutcomeStatus } from "example-shared/boutique/reporting/getOutcomeStatus";
import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { formatLoss } from "example-shared/formatting/formatLoss";
import { formatOutcome } from "example-shared/formatting/formatOutcome";
import { OUTCOME_TONES } from "example-shared/ui/constants/tones";
import ToneBadge from "src/components/Badge/ToneBadge.vue";

const props = defineProps<{
  name: BoutiqueDestination;
  outcome: DestinationOutcome | null | undefined;
}>();

const status = computed(() => getOutcomeStatus(props.outcome));
const guide = computed(() => DESTINATION_GUIDES[props.name]);
const tone = computed(() => OUTCOME_TONES[status.value]);
const label = computed(() => OUTCOME_LABELS[status.value]);
const text = computed(() => formatOutcome(props.outcome));

const losses = computed(() => {
  const outcome = props.outcome;

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
});
</script>

<template>
  <li :aria-label="guide.name" class="flex flex-col gap-1.5 py-2.5">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium">{{ guide.name }}</span>
      <ToneBadge :tone="tone">{{ label }}</ToneBadge>
    </div>
    <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ text }}</p>
    <ul
      v-if="losses.length > 0"
      :aria-label="`${guide.name} losses`"
      class="flex flex-col gap-0.5 font-mono text-xs text-zinc-500"
    >
      <li v-for="loss in losses" :key="`${loss.path}-${loss.reason}`">
        {{ formatLoss(loss) }}
      </li>
    </ul>
  </li>
</template>
