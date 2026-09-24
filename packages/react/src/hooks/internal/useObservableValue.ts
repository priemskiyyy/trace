import type { ObservableValue } from "@priemskiyyy/trace";
import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react";

import { isolate } from "src/utils/isolate";

type Release<TValue> = { value: ObservableValue<TValue>; snapshot: TValue };

export const useObservableValue = <TValue>(
  value: ObservableValue<TValue>,
  getServerSnapshot: () => TValue,
  onChange?: (value: TValue) => void | Promise<unknown>,
) => {
  const snapshot = useSyncExternalStore(
    value.subscribe,
    value.get,
    getServerSnapshot,
  );

  const rendered = value.get();
  const released = useRef<Release<TValue> | null>(null);

  const handleChange = useEffectEvent(() => {
    if (typeof onChange !== "function") {
      return;
    }

    return onChange(value.get());
  });

  const getRenderedValue = useEffectEvent(() => rendered);
  const hasOnChange = typeof onChange === "function";

  // A separate effect-owned listener isolates callback errors from React's snapshot updates.
  useEffect(() => {
    const replayed = released.current;

    released.current = null;

    if (!hasOnChange) {
      return;
    }

    const release = value.subscribe(() => handleChange());

    // The listener attaches after the render, so it catches up from the value the render read (the client's, even while hydrating) or from its own release when a remount replays it.
    const since =
      replayed?.value === value ? replayed.snapshot : getRenderedValue();

    if (!Object.is(value.get(), since)) {
      isolate(() => handleChange());
    }

    return () => {
      released.current = { value, snapshot: value.get() };
      release();
    };
  }, [value, hasOnChange]);

  return snapshot;
};
