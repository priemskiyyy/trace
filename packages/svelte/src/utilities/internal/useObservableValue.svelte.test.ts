import type { ObservableValue } from "@priemskiyyy/trace";
import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";

import { useObservableValue } from "./useObservableValue.svelte.js";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const createStore = <TValue>(initial: TValue) => {
  let value = initial;
  const listeners = new Set<() => void>();

  const store: ObservableValue<TValue> = {
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
    set: (next: TValue) => {
      value = next;

      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
};

const mount = <TResult>(use: () => TResult) => {
  const results: TResult[] = [];

  cleanups.push(
    $effect.root(() => {
      results.push(use());
    }),
  );

  return results;
};

test("the callback gets a listener of its own only when one is given", () => {
  const { store, listeners, set } = createStore(1);
  const onChange = vi.fn();
  const [value] = mount(() => useObservableValue(() => store, 0));

  flushSync();

  expect(listeners.size).toBe(1);

  mount(() => useObservableValue(() => store, 0, onChange));
  flushSync();

  expect(listeners.size).toBe(3);

  set(2);

  expect(value?.current).toBe(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("the value is the source's own, never a copy or a proxy", () => {
  const first = { state: "first" };
  const second = { state: "second" };
  const { store, set } = createStore(first);
  const [value] = mount(() => useObservableValue(() => store, first));

  expect(value?.current).toBe(first);

  flushSync();
  set(second);

  expect(value?.current).toBe(second);
});

test("until it is mounted the value reads its initial one, whatever the source holds", () => {
  const { store } = createStore(1);
  const [value] = mount(() => useObservableValue(() => store, 0));

  expect(value?.current).toBe(0);

  flushSync();

  expect(value?.current).toBe(1);
});

test("a replaced source moves the value and both listeners to it, and the switch tells the callback nothing", () => {
  const first = createStore(1);
  const second = createStore(2);
  const onChange = vi.fn();
  let source = $state.raw(first.store);
  const [value] = mount(() => useObservableValue(() => source, 0, onChange));

  flushSync();
  source = second.store;
  flushSync();

  expect(value?.current).toBe(2);
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(2);
  expect(onChange.mock.calls).toEqual([]);

  second.set(3);

  expect(value?.current).toBe(3);
  expect(onChange.mock.calls).toEqual([[3]]);
});

test("a source that recomputes to the same observable keeps both listeners", () => {
  const { store, set } = createStore(1);
  const other = createStore(5);
  const onChange = vi.fn();
  const subscribe = vi.spyOn(store, "subscribe");
  let count = $state(0);

  mount(() =>
    useObservableValue(() => (count >= 0 ? store : other.store), 0, onChange),
  );

  flushSync();
  count = 1;
  flushSync();
  set(2);

  expect(subscribe.mock.calls).toHaveLength(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a change made between the call and the callback's listener is told once", () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();
  const [value] = mount(() => useObservableValue(() => store, 0, onChange));

  set(2);
  flushSync();

  expect(value?.current).toBe(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a source replaced between the call and the callback's listener tells the callback nothing", () => {
  const first = createStore(1);
  const second = createStore(2);
  const onChange = vi.fn();
  let source = $state.raw(first.store);
  const [value] = mount(() => useObservableValue(() => source, 0, onChange));

  source = second.store;
  flushSync();

  expect(value?.current).toBe(2);
  expect(onChange.mock.calls).toEqual([]);

  second.set(3);

  expect(onChange.mock.calls).toEqual([[3]]);
});

test("the catch-up is told once, and a switch back to the first source tells nothing more", () => {
  const first = createStore(1);
  const second = createStore(5);
  const onChange = vi.fn();
  let source = $state.raw(first.store);

  mount(() => useObservableValue(() => source, 0, onChange));
  first.set(2);
  flushSync();
  source = second.store;
  flushSync();
  source = first.store;
  flushSync();

  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a callback that reads state while catching up is not resubscribed when that state changes", () => {
  const { store, listeners, set } = createStore(1);
  const heard = vi.fn();
  const subscribe = vi.spyOn(store, "subscribe");
  let label = $state("first");

  mount(() =>
    useObservableValue(
      () => store,
      0,
      (value) => {
        heard(value, label);
      },
    ),
  );

  set(2);
  flushSync();
  label = "second";
  flushSync();

  expect(subscribe.mock.calls).toHaveLength(2);
  expect(listeners.size).toBe(2);
  expect(heard.mock.calls).toEqual([[2, "first"]]);
});
