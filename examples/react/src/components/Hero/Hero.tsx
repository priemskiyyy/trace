import { Flask, ShoppingBag } from "@phosphor-icons/react";
import type React from "react";

import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { HeroStep } from "src/components/Hero/HeroStep";
import { scrollToElement } from "src/utils/scrollToElement";

export const Hero: React.FunctionComponent = () => (
  <section
    aria-label="Overview"
    className="grid gap-6 rounded-3xl border border-violet-200 bg-linear-to-br from-violet-50 via-violet-50/70 to-rose-50/60 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center dark:border-violet-900/60 dark:from-violet-950/30 dark:via-zinc-950 dark:to-rose-950/20"
  >
    <div className="flex flex-col gap-4">
      <p className="font-mono text-sm font-semibold tracking-widest text-violet-700 uppercase dark:text-violet-300">
        A Trace demo
      </p>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
        One typed event, six honest answers
      </h2>
      <p className="max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-400">
        Boutique is a small shop that tracks every click once, through Trace,
        and hands it to Amplitude, PostHog, Mixpanel, Google Analytics, Segment
        and your own API. All six run inside this page, so nothing leaves your
        browser and no provider account is needed.
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
    </div>
    <ol aria-label="How to use this page" className="flex flex-col gap-2.5">
      <HeroStep
        number={1}
        title="Shop and check out"
        description="Every search, view and checkout is one typed event, and its receipt says what each destination did with it."
      />
      <HeroStep
        number={2}
        title="Switch who is shopping"
        description="Sign in, switch accounts or join a crew. Each event keeps the shopper it was tracked with."
      />
      <HeroStep
        number={3}
        title="Break one destination"
        description="Decline consent, take your API offline or stall Segment in the lab. Only that destination's answer changes."
      />
    </ol>
  </section>
);
