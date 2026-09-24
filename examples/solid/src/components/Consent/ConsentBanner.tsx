import { useConsent, useTrace } from "@priemskiyyy/trace-solid";
import type { Component } from "solid-js";
import { Show } from "solid-js";

import { buttonStyles } from "example-shared/ui/styles/buttonStyles";

export const ConsentBanner: Component = () => {
  const trace = useTrace();
  const consent = useConsent();

  const handleAcceptClick = () => {
    trace().consent.set({ analytics: "granted" });
  };

  const handleDeclineClick = () => {
    trace().consent.set({ analytics: "denied" });
  };

  return (
    <Show
      when={consent().analytics === "unknown"}
      fallback={
        <p class="text-sm text-zinc-600 dark:text-zinc-400">
          Analytics consent is <strong>{consent().analytics}</strong>.
          Amplitude, PostHog, Mixpanel, Google Analytics and Segment{" "}
          {consent().analytics === "granted"
            ? "receive events"
            : "receive nothing"}
          ; your own API always does.
        </p>
      }
    >
      <div
        role="group"
        aria-label="Consent"
        class="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/40"
      >
        <p class="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
          May Boutique measure how the shop is used? Amplitude, PostHog,
          Mixpanel, Google Analytics and Segment wait for your answer; your own
          API always receives events.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class={buttonStyles({ variant: "ghost" })}
            onClick={handleDeclineClick}
          >
            Decline
          </button>
          <button
            type="button"
            class={buttonStyles({ variant: "primary" })}
            onClick={handleAcceptClick}
          >
            Accept
          </button>
        </div>
      </div>
    </Show>
  );
};
