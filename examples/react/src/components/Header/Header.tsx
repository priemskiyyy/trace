import { ArrowCounterClockwise, Storefront } from "@phosphor-icons/react";
import type React from "react";

import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { TraceStatusBadge } from "src/components/Badge/TraceStatusBadge";
import { IconTile } from "src/components/IconTile/IconTile";
import { SectionNav } from "src/components/Section/SectionNav";

// Nothing outlives the page, so reloading it is a complete reset.
const handleResetPress = () => {
  window.location.reload();
};

export const Header: React.FunctionComponent = () => (
  <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
      <div className="mr-auto flex min-w-0 items-center gap-2">
        <IconTile icon={Storefront} size="small" />
        <h1 className="text-lg font-semibold">Boutique</h1>
        <TraceStatusBadge />
      </div>
      <div className="order-last w-full min-w-0 lg:order-none lg:w-auto">
        <SectionNav />
      </div>
      <button
        type="button"
        onClick={handleResetPress}
        className={buttonStyles({ variant: "ghost", size: "small" })}
      >
        <ArrowCounterClockwise aria-hidden="true" size={14} weight="bold" />
        Reset demo
      </button>
    </div>
  </header>
);
