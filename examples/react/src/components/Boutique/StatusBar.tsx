import { useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import { useObservable } from "src/hooks/useObservable";

/** What Trace's diagnostics say about the session, which carries no event values. */
export const StatusBar: React.FunctionComponent = () => {
  const trace = useTrace();
  const snapshot = useObservable(trace.diagnostics);

  const buffered = snapshot.destinations.reduce(
    (sum, destination) => sum + destination.buffered,
    0,
  );

  return (
    <footer
      aria-label="Session"
      className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-200 px-4 py-2 font-mono text-xs text-zinc-500 dark:border-zinc-800"
    >
      <span className="font-semibold text-zinc-600 dark:text-zinc-300">
        Trace session
      </span>
      <span>identity #{snapshot.identity.generation}</span>
      <span>user {snapshot.identity.user?.id ?? "none"}</span>
      <span>sending {snapshot.pendingReceipts}</span>
      <span>buffered {buffered}</span>
    </footer>
  );
};
