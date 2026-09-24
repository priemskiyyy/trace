<script setup lang="ts">
import { CARD_CLASS_NAME } from "example-shared/ui/styles/cardStyles";

defineProps<{ title: string; shows: string }>();
</script>

<template>
  <section
    :aria-label="title"
    :class="`flex h-full min-w-0 flex-col gap-4 p-5 ${CARD_CLASS_NAME}`"
  >
    <header class="flex flex-col gap-1.5">
      <h3
        class="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-200"
      >
        {{ title }}
      </h3>
      <p class="text-sm text-zinc-500 dark:text-zinc-400">{{ shows }}</p>
    </header>
    <slot />
  </section>
</template>
