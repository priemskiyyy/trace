import type { TraceSnapshot } from "@priemskiyyy/trace";

import { DestinationList } from "src/components/Destinations/DestinationList";
import { PanelHeader } from "src/components/Panel/PanelHeader";
import { ResizeHandle } from "src/components/Panel/ResizeHandle";
import { Timeline } from "src/components/Timeline/Timeline";
import { useAutoFocus } from "src/hooks/useAutoFocus";
import { useEventFilters } from "src/hooks/useEventFilters";
import type { PanelPosition } from "src/types/internal/PanelPosition";
import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import { assertUnreachable } from "src/utils/assertUnreachable";

const getPanelSize = (position: PanelPosition, size: number) => {
  if (position === "bottom") {
    return { height: `${size}px` };
  }

  if (position === "right") {
    return { width: `${size}px` };
  }

  return assertUnreachable(position);
};

type DevtoolsPanelProps = {
  snapshot: TraceSnapshot;
  events: RecordedEvent[];
  isPaused: boolean;
  showValues: boolean;
  autoFocus: boolean;
  position: PanelPosition;
  size: number;
  onSizeChange: (size: number) => void;
  onDock: () => void;
  onTogglePause: () => void;
  onShowValuesChange: (showValues: boolean) => void;
  onClear: () => void;
  onClose: () => void;
};

export const DevtoolsPanel = (props: DevtoolsPanelProps) => {
  const focusOnMount = useAutoFocus(props.autoFocus);
  const filters = useEventFilters(() => props.events);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();
    props.onClose();
  };

  return (
    <aside
      ref={focusOnMount}
      tabIndex={-1}
      class="panel"
      data-position={props.position}
      aria-label="Trace devtools"
      style={getPanelSize(props.position, props.size)}
      onKeyDown={handleKeyDown}
    >
      <ResizeHandle
        position={props.position}
        size={props.size}
        onSizeChange={(size) => props.onSizeChange(size)}
      />
      <PanelHeader
        snapshot={props.snapshot}
        position={props.position}
        onDock={() => props.onDock()}
        onClose={() => props.onClose()}
      />
      <div class="body">
        <DestinationList
          destinations={props.snapshot.destinations}
          selected={filters.filters().destination}
          onSelect={(destination) => filters.update({ destination })}
        />
        <div class="main">
          <Timeline
            events={props.events}
            isPaused={props.isPaused}
            showValues={props.showValues}
            filters={filters}
            onTogglePause={() => props.onTogglePause()}
            onShowValuesChange={(showValues) =>
              props.onShowValuesChange(showValues)
            }
            onClear={() => props.onClear()}
          >
            <Timeline.Toolbar />
            <Timeline.Kinds />
            <Timeline.Rows emptyState={<Timeline.Empty />} />
          </Timeline>
        </div>
      </div>
    </aside>
  );
};
