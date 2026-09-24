import { useConsent, useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import { buttonStyles } from "example-shared/ui/styles/buttonStyles";

export const ConsentBanner: React.FunctionComponent = () => {
  const trace = useTrace();
  const consent = useConsent();

  const handleAcceptPress = () => {
    trace.consent.set({ analytics: "granted" });
  };

  const handleDeclinePress = () => {
    trace.consent.set({ analytics: "denied" });
  };

  if (consent.analytics !== "unknown") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Analytics consent is <strong>{consent.analytics}</strong>. Amplitude,
        PostHog, Mixpanel, Google Analytics and Segment{" "}
        {consent.analytics === "granted" ? "receive events" : "receive nothing"}
        ; your own API always does.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label="Consent"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/40"
    >
      <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
        May Boutique measure how the shop is used? Amplitude, PostHog, Mixpanel,
        Google Analytics and Segment wait for your answer; your own API always
        receives events.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDeclinePress}
          className={buttonStyles({ variant: "ghost" })}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={handleAcceptPress}
          className={buttonStyles({ variant: "primary" })}
        >
          Accept
        </button>
      </div>
    </div>
  );
};
