import { Flask, ShoppingBag } from "@phosphor-icons/react";
import type React from "react";

import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { scrollToElement } from "src/utils/scrollToElement";

export const Hero: React.FunctionComponent = () => (
  <section
    aria-label="Overview"
    className="grid gap-6 rounded-3xl border border-violet-200 bg-linear-to-br from-violet-50 via-violet-50/70 to-rose-50/60 p-6 sm:p-8 dark:border-violet-900/60 dark:from-violet-950/30 dark:via-zinc-950 dark:to-rose-950/20"
  >
    <p className="font-mono text-sm font-semibold tracking-widest text-violet-700 uppercase dark:text-violet-300">
      A Trace demo
    </p>
    <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
      One typed event, six honest answers
    </h2>
    <p className="max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-400">
      Boutique is a small shop that reports through Trace to six destinations at
      once: Amplitude, PostHog, Mixpanel, Google Analytics, Segment and your own
      API. All of them run inside this page, so nothing leaves your browser and
      no provider account is needed.
    </p>
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => scrollToElement("shop")}
        className={buttonStyles({ variant: "primary" })}
      >
        <ShoppingBag aria-hidden="true" size={16} weight="bold" />
        Start shopping
      </button>
      <button
        type="button"
        onClick={() => scrollToElement("lab")}
        className={buttonStyles({ variant: "ghost" })}
      >
        <Flask aria-hidden="true" size={16} weight="bold" />
        Open the lab
      </button>
    </div>
  </section>
);
