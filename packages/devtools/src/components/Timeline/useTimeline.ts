import { createContext, useContext } from "solid-js";

import type { TimelineContextValue } from "src/types/internal/TimelineContextValue";

export const TimelineContext = createContext<TimelineContextValue>();

export const useTimeline = () => {
  const timeline = useContext(TimelineContext);

  if (timeline === undefined) {
    throw new Error("Timeline parts must be rendered inside <Timeline>.");
  }

  return timeline;
};
