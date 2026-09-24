import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Receipt } from "@priemskiyyy/trace";
import { useTrace } from "@priemskiyyy/trace-react";
import clsx from "clsx";
import type React from "react";
import { useState } from "react";

import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { FIELD_CLASS_NAME } from "example-shared/ui/styles/fieldStyles";

const SUGGESTIONS = ["boots", "scarf", "gift"];

type SearchFormProps = {
  onReceipt: (receipt: Receipt<BoutiqueDestination>, action: string) => void;
};

export const SearchForm: React.FunctionComponent<SearchFormProps> = ({
  onReceipt,
}) => {
  const trace = useTrace();
  const [query, setQuery] = useState("");

  const trackSearch = (term: string) => {
    onReceipt(
      trace.track("Search Performed", { query: term }),
      `Search for "${term}"`,
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const term = query.trim();

    if (term === "") {
      return;
    }

    trackSearch(term);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        role="search"
        aria-label="Search the shop"
        onSubmit={handleSubmit}
        className="flex items-center gap-2"
      >
        <div className="relative flex min-w-0 flex-1 items-center">
          <MagnifyingGlass
            aria-hidden="true"
            size={16}
            weight="bold"
            className="pointer-events-none absolute left-3 text-zinc-400"
          />
          <input
            type="search"
            aria-label="Search the shop"
            placeholder="Search scarves, boots, totes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={clsx("w-full pl-9", FIELD_CLASS_NAME)}
          />
        </div>
        <button type="submit" className={buttonStyles({ size: "small" })}>
          Search
        </button>
      </form>
      <div
        role="group"
        aria-label="Suggested searches"
        className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400"
      >
        <span>Try</span>
        {SUGGESTIONS.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => trackSearch(term)}
            className={buttonStyles({ variant: "ghost", size: "small" })}
          >
            {term}
          </button>
        ))}
      </div>
    </div>
  );
};
