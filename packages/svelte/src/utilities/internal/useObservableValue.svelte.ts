import type { ObservableValue } from "@priemskiyyy/trace";
import { untrack } from "svelte";
import type { ReadableValue } from "../../types/ReadableValue.js";
import { isolate } from "../../utils/isolate.js";

export const useObservableValue = <TValue>(
  observable: () => ObservableValue<TValue>,
  initial: TValue,
  onChange?: (value: TValue) => void | Promise<unknown>,
): ReadableValue<TValue> => {
  const observed = observable();
  const rendered = observed.get();
  // Derived, so a source that recomputes to the same observable keeps its listeners.
  const source = $derived(observable());
  // Raw, so the status keeps its identity instead of being proxied.
  let snapshot = $state.raw(initial);
  let isFirstRun = true;

  // Effects never run on the server and run after mount on the client, so both render `initial` first.
  $effect(() => {
    const current = source;

    snapshot = current.get();

    return current.subscribe(() => {
      snapshot = current.get();
    });
  });

  $effect(() => {
    if (typeof onChange !== "function") {
      return;
    }

    // A listener of its own, so a callback that throws cannot disturb the snapshot.
    const current = source;
    const release = current.subscribe(() => onChange(current.get()));

    // The listener attaches after mount, so it catches up once from the value read when the utility was called (the client's, even while hydrating).
    if (
      isFirstRun &&
      current === observed &&
      !Object.is(current.get(), rendered)
    ) {
      untrack(() => isolate(() => onChange(current.get())));
    }

    isFirstRun = false;

    return release;
  });

  return {
    get current() {
      return snapshot;
    },
  };
};
