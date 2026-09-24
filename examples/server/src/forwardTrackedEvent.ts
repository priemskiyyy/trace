import { event, Trace } from "@priemskiyyy/trace";
import { posthog } from "@priemskiyyy/trace-posthog-node";
import { segment } from "@priemskiyyy/trace-segment-node";
import type { createSimulatedServerProviders } from "example-shared/simulated/createSimulatedServerProviders";
import type { z } from "zod";
import type { trackedEventSchema } from "src/requests";

type TrackedEventPayload = z.infer<typeof trackedEventSchema>;

/**
 * Replays one already-accepted event through a fresh, per-request Trace over
 * the two node destinations, so the same identity and properties reach each
 * simulated client the way the README's `trackCheckout` example builds one.
 */
export const forwardTrackedEvent = async (
  providers: ReturnType<typeof createSimulatedServerProviders>,
  wire: TrackedEventPayload,
) => {
  const trace = new Trace({
    events: { [wire.name]: event<Record<string, unknown>>() },
    destinations: {
      posthog: posthog({ sdk: providers.posthog.sdk }),
      segment: segment({ sdk: providers.segment.sdk }),
    },
  });

  trace.start();

  if (wire.identity.user !== null) {
    trace.user({ id: wire.identity.user.id, traits: wire.identity.traits });
  }

  for (const [type, group] of Object.entries(wire.identity.groups)) {
    trace.group(type, { id: group.id, traits: group.traits });
  }

  const receipt = trace.track(wire.name, wire.properties, {
    context: wire.context,
    timestamp: wire.timestamp,
  });

  const status = await receipt.settled;

  await trace.flush();
  trace.dispose();

  return { id: receipt.id, status };
};
