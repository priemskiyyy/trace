<script setup lang="ts">
import { useConsent, useTrace } from "@priemskiyyy/trace-vue";

import { buttonStyles } from "example-shared/ui/styles/buttonStyles";

const trace = useTrace();
const consent = useConsent();

const handleAcceptClick = () => {
  trace.value.consent.set({ analytics: "granted" });
};

const handleDeclineClick = () => {
  trace.value.consent.set({ analytics: "denied" });
};
</script>

<template>
  <p
    v-if="consent.analytics !== 'unknown'"
    class="text-sm text-zinc-600 dark:text-zinc-400"
  >
    The analytics consent decision is
    <strong>{{ consent.analytics }}</strong> right now, so Amplitude, PostHog,
    Mixpanel, Google Analytics and Segment
    {{
      consent.analytics === "granted" ? "receive events" : "receive nothing"
    }}; your own API always does.
  </p>
  <div
    v-else
    role="group"
    aria-label="Consent"
    class="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/40"
  >
    <p class="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
      May Boutique measure how the shop is used? Amplitude, PostHog, Mixpanel,
      Google Analytics and Segment wait for your answer; your own API always
      receives events.
    </p>
    <div class="flex gap-2">
      <button
        type="button"
        :class="buttonStyles({ variant: 'ghost' })"
        @click="handleDeclineClick"
      >
        Decline
      </button>
      <button
        type="button"
        :class="buttonStyles({ variant: 'primary' })"
        @click="handleAcceptClick"
      >
        Accept
      </button>
    </div>
  </div>
</template>
