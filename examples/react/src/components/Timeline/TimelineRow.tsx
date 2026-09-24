import type React from "react";

import type { TimelineEntry } from "example-shared/boutique/reporting/types/TimelineEntry";
import { formatClockTime } from "example-shared/formatting/formatClockTime";
import type { Tone } from "example-shared/ui/types/Tone";
import { Badge } from "src/components/Badge/Badge";

type TimelineRowProps = { entry: TimelineEntry };

const getTone = (entry: TimelineEntry): Tone => {
  if (entry.type.endsWith("failed") || entry.type.endsWith("refused")) {
    return "danger";
  }

  if (entry.type === "buffer overflow") {
    return "warning";
  }

  if (entry.source === "consent") {
    return "info";
  }

  return "neutral";
};

export const TimelineRow: React.FunctionComponent<TimelineRowProps> = ({
  entry,
}) => (
  <li className="flex items-center justify-between gap-3 py-2 text-sm">
    <span className="flex flex-wrap items-center gap-2">
      <Badge tone={getTone(entry)}>{entry.source}</Badge>
      <span className="capitalize">{entry.type}</span>
      {entry.destination === null ? null : (
        <span className="font-mono text-xs text-zinc-500">
          {entry.destination.name}
        </span>
      )}
    </span>
    <span className="font-mono text-xs text-zinc-500">
      {formatClockTime(entry.timestamp)}
    </span>
  </li>
);
