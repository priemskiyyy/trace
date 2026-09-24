<script setup lang="ts">
import { useTraceStatus } from "@priemskiyyy/trace-vue";
import { computed } from "vue";

import { TRACE_STATUS_LABELS } from "example-shared/boutique/reporting/constants/labels";
import { TRACE_STATUS_TONES } from "example-shared/ui/constants/tones";
import { dotStyles } from "example-shared/ui/styles/dotStyles";
import ToneBadge from "src/components/Badge/ToneBadge.vue";

const status = useTraceStatus();
const tone = computed(() => TRACE_STATUS_TONES[status.value.state]);
</script>

<template>
  <ToneBadge :tone="tone">
    <span aria-hidden="true" :class="dotStyles({ tone })" />
    {{ TRACE_STATUS_LABELS[status.state] }}
  </ToneBadge>
</template>
