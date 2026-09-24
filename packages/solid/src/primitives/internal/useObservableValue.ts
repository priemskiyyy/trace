import type { ObservableValue } from "@priemskiyyy/trace";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import type { Accessor } from "solid-js";

import { isolate } from "src/utils/isolate";

export const useObservableValue = <TValue>(
  observable: Accessor<ObservableValue<TValue>>,
  initial: TValue,
  onChange?: (value: TValue) => void | Promise<unknown>,
): Accessor<TValue> => {
  const [snapshot, setSnapshot] = createSignal(initial);
  // A memo, so a source that recomputes to the same observable keeps its listeners.
  const source = createMemo(observable);
  const observed = source();
  const rendered = observed.get();

  // Solid claims server markup as it is while hydrating, so the value reads `initial` until mounted.
  onMount(() => {
    createEffect((previous?: ObservableValue<TValue>) => {
      const current = source();

      setSnapshot(() => current.get());
      onCleanup(current.subscribe(() => setSnapshot(() => current.get())));

      if (typeof onChange !== "function") {
        return current;
      }

      // A listener of its own, so a callback that throws cannot disturb the snapshot.
      onCleanup(current.subscribe(() => onChange(current.get())));

      // The listener attaches at mount, so it catches up once from the value read when the primitive was called (the client's, even while hydrating).
      if (
        previous === undefined &&
        current === observed &&
        !Object.is(current.get(), rendered)
      ) {
        untrack(() => isolate(() => onChange(current.get())));
      }

      return current;
    });
  });

  return snapshot;
};
