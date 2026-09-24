import type { DestinationStatus } from "@priemskiyyy/trace";
import { toValue } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";

import { useObservableValue } from "src/composables/internal/useObservableValue";
import { useTrace } from "src/composables/useTrace";
import type { RegisteredDestinationName } from "src/types/Register";

const IDLE_DESTINATION_STATUS = Object.freeze({
  state: "idle",
}) satisfies DestinationStatus;

/**
 * Observes one destination as a read-only ref: `idle`, `ready` (locally
 * usable, not proof that a network is reachable), `failed` or `disposed`. It
 * only observes, follows a name given as a ref or a getter, and reads `idle`
 * on the server and until the component is mounted.
 *
 * @example
 * ```ts
 * const product = useDestinationStatus("product");
 *
 * const isFailed = computed(() => product.value.state === "failed");
 * ```
 */
export const useDestinationStatus = (
  name: MaybeRefOrGetter<RegisteredDestinationName>,
  onChange?: (status: DestinationStatus) => void | Promise<unknown>,
): ComputedRef<DestinationStatus> => {
  const trace = useTrace();

  return useObservableValue<DestinationStatus>(
    () => trace.value.destination(toValue(name)).status,
    IDLE_DESTINATION_STATUS,
    onChange,
  );
};
