import { Eraser, Waveform } from "@phosphor-icons/react";
import type React from "react";

import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { TimelineRow } from "src/components/Timeline/TimelineRow";
import { useEventLog } from "src/hooks/useEventLog";
import type { BoutiqueRuntime } from "src/types/BoutiqueRuntime";

type TimelinePanelProps = { runtime: BoutiqueRuntime };

export const TimelinePanel: React.FunctionComponent<TimelinePanelProps> = ({
  runtime,
}) => {
  const entries = useEventLog(runtime.timeline);

  return (
    <Panel
      title="Timeline"
      icon={Waveform}
      shows="Trace's own diagnostics stream: every accepted event and what each destination did with it, never the values themselves."
      aside={
        <button
          type="button"
          disabled={entries.length === 0}
          onClick={runtime.timeline.clear}
          className={buttonStyles({ size: "small" })}
        >
          <Eraser aria-hidden="true" size={14} weight="bold" />
          Clear
        </button>
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={Waveform}
          title="Nothing happened yet"
          description="Shop, sign in or open the lab to see the timeline fill in."
        />
      ) : (
        <ol
          aria-label="Timeline events"
          className="flex max-h-[28rem] flex-col divide-y divide-zinc-200/70 overflow-y-auto dark:divide-zinc-800"
        >
          {entries.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </Panel>
  );
};
