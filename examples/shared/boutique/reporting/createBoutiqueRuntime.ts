import type { OrdersBackend } from "example-shared/backend/types/OrdersBackend";
import { createBoutiqueTrace } from "example-shared/boutique/reporting/createBoutiqueTrace";
import { createTrackedReceipt } from "example-shared/boutique/reporting/createTrackedReceipt";
import type { TimelineEntry } from "example-shared/boutique/reporting/types/TimelineEntry";
import type { TrackedReceipt } from "example-shared/boutique/reporting/types/TrackedReceipt";
import type { AccountId } from "example-shared/boutique/users/types/AccountId";
import type { SimulatedProviders } from "example-shared/simulated/types/SimulatedProviders";
import { createEventLog } from "example-shared/utils/createEventLog";

/**
 * One Trace and what the page shows about it: its receipts and its
 * diagnostics timeline. A disposed Trace cannot start again, so a restart is
 * a new runtime.
 */
export const createBoutiqueRuntime = ({
  backend,
  providers,
}: {
  backend: OrdersBackend;
  providers: SimulatedProviders;
}) => {
  const trace = createBoutiqueTrace({ backend, providers });
  const receipts = createEventLog<TrackedReceipt>(20);
  const timeline = createEventLog<TimelineEntry>(80);
  let nextEventId = 1;

  const stopTimeline = trace.diagnostics.events.subscribe((event) => {
    timeline.add({ ...event, id: nextEventId });
    nextEventId += 1;
  });

  return {
    trace,
    receipts: receipts.log,
    timeline: timeline.log,
    track: (
      receipt: TrackedReceipt["receipt"],
      action: string,
      account: AccountId | null,
    ) => {
      receipts.add(createTrackedReceipt(trace, { receipt, action, account }));
    },
    dispose: () => {
      stopTimeline();
      trace.dispose();
    },
  };
};
