<script setup lang="ts">
import { badgeStyles } from "example-shared/ui/styles/badgeStyles";
import type { Tone } from "example-shared/ui/types/Tone";

defineProps<{ tone: Tone }>();
</script>

<template>
  <span :class="badgeStyles({ tone })"><slot /></span>
</template>
