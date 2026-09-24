import { createOrdersBackend } from "example-shared/backend/createOrdersBackend";
import { createSimulatedProviders } from "example-shared/simulated/createSimulatedProviders";
import { createEventLog } from "example-shared/utils/createEventLog";
import { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";
import type { TimelineEntry } from "src/types/TimelineEntry";
import type { TrackedReceipt } from "src/types/TrackedReceipt";

/**
 * The backend, the SDKs and Boutique's Trace, started. It runs once, outside
 * React, where Strict Mode cannot start it twice.
 */
export const startBoutique = ({ latency }: { latency: number }) => {
  const backend = createOrdersBackend({ latency });
  const providers = createSimulatedProviders();
  const trace = createBoutiqueTrace({ backend, providers });
  const receipts = createEventLog<TrackedReceipt>(20);
  const timeline = createEventLog<TimelineEntry>(80);
  let nextEventId = 1;

  const stopTimeline = trace.diagnostics.events.subscribe((event) => {
    timeline.add({ ...event, id: nextEventId });
    nextEventId += 1;
  });

  trace.start();

  return {
    backend,
    providers,
    trace,
    receipts: receipts.log,
    timeline: timeline.log,
    track: (
      receipt: TrackedReceipt["receipt"],
      action: string,
      account: TrackedReceipt["account"],
    ) => {
      receipts.add({ receipt, action, account, at: Date.now() });
    },
    dispose: () => {
      stopTimeline();
      trace.dispose();
    },
  };
};
