import { ShieldCheck } from "@phosphor-icons/react";
import type { MappingLoss } from "@priemskiyyy/trace";
import type React from "react";

import { formatLoss } from "example-shared/formatting/formatLoss";

type RemovedFieldsProps = { removed: MappingLoss[] };

export const RemovedFields: React.FunctionComponent<RemovedFieldsProps> = ({
  removed,
}) => {
  if (removed.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-200/70 dark:bg-emerald-950/20 dark:ring-emerald-900/50">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        <ShieldCheck aria-hidden="true" size={16} weight="duotone" />
        Removed before any destination saw it
      </p>
      <ul
        aria-label="Removed before sending"
        className="flex flex-col gap-0.5 font-mono text-xs text-emerald-900/80 dark:text-emerald-200/80"
      >
        {removed.map((loss) => (
          <li key={formatLoss(loss)}>{formatLoss(loss)}</li>
        ))}
      </ul>
    </div>
  );
};
