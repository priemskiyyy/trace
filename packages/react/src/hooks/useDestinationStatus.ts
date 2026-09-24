import type { DestinationStatus } from "@priemskiyyy/trace";

import { useObservableValue } from "src/hooks/internal/useObservableValue";
import { useTrace } from "src/hooks/useTrace";
import type { RegisteredDestinationName } from "src/types/Register";

// Interned so the server snapshot is one reference per render.
const IDLE_DESTINATION_STATUS = Object.freeze({
  state: "idle",
}) satisfies DestinationStatus;

/**
 * Observes one destination: `idle`, `ready` (locally usable, not proof that a
 * network is reachable), `failed` or `disposed`. It only observes, never opens
 * the destination, and reads `idle` on the server and during hydration.
 *
 * @example
 * ```tsx
 * const product = useDestinationStatus("product");
 *
 * if (product.state === "failed") console.warn("Amplitude did not open", product.error);
 * ```
 */
export const useDestinationStatus = (
  name: RegisteredDestinationName,
  onChange?: (status: DestinationStatus) => void | Promise<unknown>,
): DestinationStatus => {
  const trace = useTrace();

  return useObservableValue(
    trace.destination(name).status,
    () => IDLE_DESTINATION_STATUS,
    onChange,
  );
};
