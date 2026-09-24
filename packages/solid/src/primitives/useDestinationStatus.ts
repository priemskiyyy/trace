import type { DestinationStatus } from "@priemskiyyy/trace";
import type { Accessor } from "solid-js";

import { useObservableValue } from "src/primitives/internal/useObservableValue";
import { useTrace } from "src/primitives/useTrace";
import type { RegisteredDestinationName } from "src/types/Register";

const IDLE_DESTINATION_STATUS = Object.freeze({
  state: "idle",
}) satisfies DestinationStatus;

/**
 * Observes one destination as an accessor: `idle`, `ready` (locally usable,
 * not proof that a network is reachable), `failed` or `disposed`. It only
 * observes, follows a name given as an accessor, and reads `idle` on the server
 * and until the component is mounted.
 *
 * @example
 * ```tsx
 * const product = useDestinationStatus("product");
 *
 * <Show when={product().state === "failed"}>Amplitude did not open.</Show>;
 * ```
 */
export const useDestinationStatus = (
  name: RegisteredDestinationName | Accessor<RegisteredDestinationName>,
  onChange?: (status: DestinationStatus) => void | Promise<unknown>,
): Accessor<DestinationStatus> => {
  const trace = useTrace();

  // Read inside the tracked source, so an accessor is followed as it changes.
  const readName = () => {
    if (typeof name === "function") {
      return name();
    }

    return name;
  };

  return useObservableValue<DestinationStatus>(
    () => trace().destination(readName()).status,
    IDLE_DESTINATION_STATUS,
    onChange,
  );
};
