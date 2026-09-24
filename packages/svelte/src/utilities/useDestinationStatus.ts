import type { DestinationStatus } from "@priemskiyyy/trace";
import type { ReadableValue } from "../types/ReadableValue.js";
import type { RegisteredDestinationName } from "../types/Register.js";
import { useObservableValue } from "./internal/useObservableValue.svelte.js";
import { useTrace } from "./useTrace.js";

const IDLE_DESTINATION_STATUS = Object.freeze({
  state: "idle",
}) satisfies DestinationStatus;

/**
 * Observes one destination through `current`: `idle`, `ready` (locally
 * usable, not proof that a network is reachable), `failed` or `disposed`. It
 * only observes, follows a name given as a getter, and reads `idle` on the
 * server and until the component is mounted.
 *
 * @example
 * ```ts
 * const product = useDestinationStatus("product");
 *
 * const isFailed = $derived(product.current.state === "failed");
 * ```
 */
export const useDestinationStatus = (
  name: RegisteredDestinationName | (() => RegisteredDestinationName),
  onChange?: (status: DestinationStatus) => void | Promise<unknown>,
): ReadableValue<DestinationStatus> => {
  const trace = useTrace();

  // Read inside the tracked source, so a getter is followed as it changes.
  const readName = () => {
    if (typeof name === "function") {
      return name();
    }

    return name;
  };

  return useObservableValue<DestinationStatus>(
    () => trace.current.destination(readName()).status,
    IDLE_DESTINATION_STATUS,
    onChange,
  );
};
