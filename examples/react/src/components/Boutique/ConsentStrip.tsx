import { ShieldCheck } from "@phosphor-icons/react";
import { useConsent, useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import {
  CONSENT_LABELS,
  CONSENT_MEANINGS,
} from "example-shared/boutique/reporting/constants/labels";
import { CONSENT_TONES } from "example-shared/ui/constants/tones";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { Badge } from "src/components/Badge/Badge";

/** Boutique's consent banner while the question is open, then the answer and a way to ask again. */
export const ConsentStrip: React.FunctionComponent = () => {
  const trace = useTrace();
  const { analytics } = useConsent();

  const handleAcceptPress = () => {
    trace.consent.set({ analytics: "granted" });
  };

  const handleDeclinePress = () => {
    trace.consent.set({ analytics: "denied" });
  };

  const handleAskAgainPress = () => {
    trace.consent.set({ analytics: "unknown" });
  };

  if (analytics === "unknown") {
    return (
      <div
        role="group"
        aria-label="Consent"
        className="flex flex-wrap items-center gap-3 border-b border-violet-200/70 bg-violet-50/80 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/30"
      >
        <p className="min-w-0 flex-1 text-sm text-violet-950 dark:text-violet-100">
          <span className="font-semibold">
            May Boutique measure how the shop is used?
          </span>{" "}
          {CONSENT_MEANINGS.unknown}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDeclinePress}
            className={buttonStyles({ variant: "ghost", size: "small" })}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAcceptPress}
            className={buttonStyles({ variant: "primary", size: "small" })}
          >
            Accept
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Consent"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800"
    >
      <ShieldCheck
        aria-hidden="true"
        size={16}
        weight="duotone"
        className="shrink-0 text-violet-600 dark:text-violet-400"
      />
      <Badge tone={CONSENT_TONES[analytics]}>{CONSENT_LABELS[analytics]}</Badge>
      <p className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
        {CONSENT_MEANINGS[analytics]}
      </p>
      <button
        type="button"
        onClick={handleAskAgainPress}
        className={buttonStyles({ variant: "ghost", size: "small" })}
      >
        Ask again
      </button>
    </div>
  );
};
