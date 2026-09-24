import { Index, Show } from "solid-js";

import { formatDestinationLine } from "src/formatting/formatDestinationLine";
import type { ObservedDestination } from "src/types/internal/ObservedDestination";

type DestinationListProps = {
  destinations: ObservedDestination[];
  selected: string | null;
  onSelect: (destination: string | null) => void;
};

// Rows are kept by position, because a Trace's destinations never reorder, so a focused row survives a new snapshot.
export const DestinationList = (props: DestinationListProps) => (
  <nav class="destinations" aria-label="Trace destinations">
    <button
      type="button"
      class="destination"
      aria-pressed={props.selected === null}
      onClick={() => props.onSelect(null)}
    >
      <span class="destination-name">All destinations</span>
      <span class="count">{props.destinations.length}</span>
    </button>
    <Index each={props.destinations}>
      {(destination) => (
        <button
          type="button"
          class="destination"
          aria-pressed={props.selected === destination().name}
          onClick={() => props.onSelect(destination().name)}
        >
          <span class="destination-name">
            <span class="dot" data-state={destination().status.state} />
            {destination().name}
          </span>
          <small>{formatDestinationLine(destination())}</small>
        </button>
      )}
    </Index>
    <Show when={props.destinations.length === 0}>
      <p class="destination-empty">no destinations</p>
    </Show>
  </nav>
);
