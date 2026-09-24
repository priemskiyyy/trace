import type { ObservableValue } from "@priemskiyyy/trace";
import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";

export const useObservable = <TValue>(
  observable: ObservableValue<TValue>,
): Accessor<TValue> => {
  const [snapshot, setSnapshot] = createSignal(observable.get());

  onCleanup(
    observable.subscribe(() => {
      setSnapshot(() => observable.get());
    }),
  );

  return snapshot;
};
