import type { Accessor } from "solid-js";

import type { EventFilterControls } from "src/types/internal/EventFilterControls";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";

export type TimelineContextValue = {
  events: Accessor<RecordedEvent[]>;
  isPaused: Accessor<boolean>;
  showValues: Accessor<boolean>;
  filters: EventFilterControls;
  onTogglePause: () => void;
  onShowValuesChange: (showValues: boolean) => void;
  onClear: () => void;
};
