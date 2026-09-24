import type { ObservableValue } from "@priemskiyyy/trace";
import { onUnmounted, shallowRef } from "vue";
import type { ShallowRef } from "vue";

export const useObservable = <TValue>(
  observable: ObservableValue<TValue>,
): ShallowRef<TValue> => {
  const snapshot = shallowRef(observable.get());

  onUnmounted(
    observable.subscribe(() => {
      snapshot.value = observable.get();
    }),
  );

  return snapshot;
};
