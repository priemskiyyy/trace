import type { ObservableValue } from "@priemskiyyy/trace";
import { computed, onMounted, onWatcherCleanup, shallowRef, watch } from "vue";
import type { ComputedRef, ShallowRef } from "vue";

import { isolate } from "src/utils/isolate";

export const useObservableValue = <TValue>(
  observable: () => ObservableValue<TValue>,
  initial: TValue,
  onChange?: (value: TValue) => void | Promise<unknown>,
): ComputedRef<TValue> => {
  // Annotated, because `shallowRef` answers a generic with a conditional type that reads as `any`.
  const snapshot: ShallowRef<TValue> = shallowRef(initial);
  const observed = observable();
  const rendered = observed.get();

  // Subscribed once mounted, so the server and the hydrating client both render `initial`.
  onMounted(() => {
    watch(
      observable,
      (current, previous) => {
        snapshot.value = current.get();
        onWatcherCleanup(
          current.subscribe(() => {
            snapshot.value = current.get();
          }),
        );

        if (typeof onChange !== "function") {
          return;
        }

        // A listener of its own, so a callback that throws cannot disturb the snapshot.
        onWatcherCleanup(current.subscribe(() => onChange(current.get())));

        // The listener attaches at mount, so it catches up once from the value setup read (the client's, even while hydrating).
        if (
          previous === undefined &&
          current === observed &&
          !Object.is(current.get(), rendered)
        ) {
          isolate(() => onChange(current.get()));
        }
      },
      { immediate: true, flush: "sync" },
    );
  });

  // Read-only, and the status keeps its identity instead of being proxied.
  return computed(() => snapshot.value);
};
