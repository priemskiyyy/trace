import { For, createMemo } from "solid-js";

import { useTimeline } from "src/components/Timeline/useTimeline";
import { formatEventKind } from "src/formatting/formatEventKind";
import type { RecordedEventKind } from "src/types/internal/RecordedEventKind";
import { countEventsByKind } from "src/utils/countEventsByKind";

const KINDS: RecordedEventKind[] = [
  "ERROR",
  "EVENT",
  "DESTINATION",
  "IDENTITY",
  "CONSENT",
  "RUNTIME",
];

export const TimelineKinds = () => {
  const timeline = useTimeline();
  const counts = createMemo(() => countEventsByKind(timeline.events()));
  const selected = () => timeline.filters.filters().kind;

  return (
    <div class="kinds" role="group" aria-label="Event kinds">
      <button
        type="button"
        class="chip"
        aria-pressed={selected() === null}
        onClick={() => timeline.filters.update({ kind: null })}
      >
        All <span class="count">{timeline.events().length}</span>
      </button>
      <For each={KINDS}>
        {(kind) => (
          <button
            type="button"
            class="chip"
            data-kind={kind}
            aria-pressed={selected() === kind}
            onClick={() => timeline.filters.update({ kind })}
          >
            {formatEventKind(kind)} <span class="count">{counts()[kind]}</span>
          </button>
        )}
      </For>
    </div>
  );
};
