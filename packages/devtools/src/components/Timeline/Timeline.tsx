import type { ParentProps } from "solid-js";

import { TimelineEmpty } from "src/components/Timeline/TimelineEmpty";
import { TimelineKinds } from "src/components/Timeline/TimelineKinds";
import { TimelineRows } from "src/components/Timeline/TimelineRows";
import { TimelineToolbar } from "src/components/Timeline/TimelineToolbar";
import { TimelineContext } from "src/components/Timeline/useTimeline";
import type { EventFilterControls } from "src/types/internal/EventFilterControls";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import type { TimelineContextValue } from "src/types/internal/TimelineContextValue";

type TimelineProps = ParentProps<{
  events: RecordedEvent[];
  isPaused: boolean;
  showValues: boolean;
  filters: EventFilterControls;
  onTogglePause: () => void;
  onShowValuesChange: (showValues: boolean) => void;
  onClear: () => void;
}>;

const TimelineRoot = (props: TimelineProps) => {
  const value: TimelineContextValue = {
    events: () => props.events,
    isPaused: () => props.isPaused,
    showValues: () => props.showValues,
    filters: props.filters,
    onTogglePause: () => props.onTogglePause(),
    onShowValuesChange: (showValues) => props.onShowValuesChange(showValues),
    onClear: () => props.onClear(),
  };

  return (
    <TimelineContext.Provider value={value}>
      <div class="timeline">{props.children}</div>
    </TimelineContext.Provider>
  );
};

export const Timeline = Object.assign(TimelineRoot, {
  Toolbar: TimelineToolbar,
  Kinds: TimelineKinds,
  Rows: TimelineRows,
  Empty: TimelineEmpty,
});
