// @vitest-environment jsdom
import type { ObservableValue } from "@priemskiyyy/trace";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { useObservableValue } from "src/hooks/internal/useObservableValue";

afterEach(cleanup);

const createStore = (initial: number) => {
  let value = initial;
  const listeners = new Set<() => void>();

  const store: ObservableValue<number> = {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    store,
    listeners,
    set: (next: number) => {
      value = next;

      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
};

test("the optional callback adds a listener only while present and reads the latest callback", () => {
  const { store, listeners, set } = createStore(1);
  const first = vi.fn();
  const second = vi.fn();

  const { result, rerender } = renderHook(
    ({ onChange }: { onChange?: (value: number) => void }) =>
      useObservableValue(store, () => 0, onChange),
    { initialProps: {} },
  );

  expect(result.current).toBe(1);
  expect(listeners.size).toBe(1);

  rerender({ onChange: first });

  expect(listeners.size).toBe(2);

  rerender({ onChange: second });
  act(() => set(2));

  expect(result.current).toBe(2);
  expect(first.mock.calls).toEqual([]);
  expect(second.mock.calls).toEqual([[2]]);
  expect(listeners.size).toBe(2);

  rerender({});

  expect(listeners.size).toBe(1);
});

test("a replaced observable moves the snapshot and both listeners to it", () => {
  const first = createStore(1);
  const second = createStore(2);
  const onChange = vi.fn();

  const { result, rerender } = renderHook(
    ({ store }: { store: ObservableValue<number> }) =>
      useObservableValue(store, () => 0, onChange),
    { initialProps: { store: first.store } },
  );

  rerender({ store: second.store });

  expect(result.current).toBe(2);
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(2);

  act(() => second.set(3));

  expect(result.current).toBe(3);
  expect(onChange.mock.calls).toEqual([[3]]);
});

test("a change that lands before a removed callback's listener is released calls no callback", () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();

  const initialProps: { callback?: (value: number) => void; next: number } = {
    callback: onChange,
    next: 1,
  };

  const { result, rerender } = renderHook(
    ({ callback, next }) => {
      const value = useObservableValue(store, () => 0, callback);

      useLayoutEffect(() => {
        set(next);
      }, [next]);

      return value;
    },
    { initialProps },
  );

  rerender({ next: 2 });

  expect(result.current).toBe(2);
  expect(onChange.mock.calls).toEqual([]);
});

test("a change made between the render and the callback's listener is told once", () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();

  const { result } = renderHook(() => {
    const value = useObservableValue(store, () => 0, onChange);

    useLayoutEffect(() => {
      set(2);
    }, []);

    return value;
  });

  expect(result.current).toBe(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("Strict Mode's second run of the listener's effect tells a change made before it once", () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();

  const { result } = renderHook(
    () => {
      const value = useObservableValue(store, () => 0, onChange);

      useLayoutEffect(() => {
        set(2);
      }, []);

      return value;
    },
    { wrapper: StrictMode },
  );

  expect(result.current).toBe(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a change made while Strict Mode remounts the listener is told as well", () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();

  const { result } = renderHook(
    () => {
      const value = useObservableValue(store, () => 0, onChange);

      useLayoutEffect(() => {
        set(store.get() + 1);
      }, []);

      return value;
    },
    { wrapper: StrictMode },
  );

  expect(result.current).toBe(3);
  expect(onChange.mock.calls).toEqual([[2], [3]]);
});

test("a callback added back is not told a change made while it was absent", () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();

  const initialProps: { callback?: (value: number) => void } = {
    callback: onChange,
  };

  const { result, rerender } = renderHook(
    ({ callback }) => useObservableValue(store, () => 0, callback),
    { initialProps },
  );

  rerender({});
  act(() => set(2));
  rerender({ callback: onChange });

  expect(result.current).toBe(2);
  expect(onChange.mock.calls).toEqual([]);

  act(() => set(3));

  expect(onChange.mock.calls).toEqual([[3]]);
});
