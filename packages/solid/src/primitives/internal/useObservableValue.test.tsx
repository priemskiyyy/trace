import type { ObservableValue } from "@priemskiyyy/trace";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { useObservableValue } from "src/primitives/internal/useObservableValue";

const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) {
    dispose();
  }
});

const createStore = <TValue,>(initial: TValue) => {
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

const mount = <TResult,>(use: () => TResult) =>
  createRoot((dispose) => {
    disposals.push(dispose);

    return use();
  });

test("the callback gets a listener of its own only when one is given", () => {
  const { store, listeners, set } = createStore(1);
  const onChange = vi.fn();
  const value = mount(() => useObservableValue(() => store, 0));

  expect(listeners.size).toBe(1);

  mount(() => useObservableValue(() => store, 0, onChange));

  expect(listeners.size).toBe(3);

  set(2);

  expect(value()).toBe(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("until it is mounted the value reads its initial one, whatever the source holds", () => {
  const { store } = createStore(1);
  const read = vi.fn();

  const value = mount(() => {
    const observed = useObservableValue(() => store, 0);

    read(observed());

    return observed;
  });

  expect(read.mock.calls).toEqual([[0]]);
  expect(value()).toBe(1);
});

test("a replaced source moves the value and both listeners to it, and the switch tells the callback nothing", () => {
  const first = createStore(1);
  const second = createStore(2);
  const [source, setSource] = createSignal(first.store);
  const onChange = vi.fn();
  const value = mount(() => useObservableValue(source, 0, onChange));

  setSource(() => second.store);

  expect(value()).toBe(2);
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(2);
  expect(onChange.mock.calls).toEqual([]);

  second.set(3);

  expect(value()).toBe(3);
  expect(onChange.mock.calls).toEqual([[3]]);
});

test("a source that recomputes to the same observable keeps both listeners", () => {
  const { store, set } = createStore(1);
  const [count, setCount] = createSignal(0);
  const onChange = vi.fn();
  const subscribe = vi.spyOn(store, "subscribe");

  mount(() =>
    useObservableValue(
      () => {
        count();

        return store;
      },
      0,
      onChange,
    ),
  );

  setCount(1);
  set(2);

  expect(subscribe.mock.calls).toHaveLength(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a change made between the call and the callback's listener is told once", () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();

  const value = mount(() => {
    const observed = useObservableValue(() => store, 0, onChange);

    set(2);

    return observed;
  });

  expect(value()).toBe(2);
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a source replaced between the call and the callback's listener tells the callback nothing", () => {
  const first = createStore(1);
  const second = createStore(2);
  const [source, setSource] = createSignal(first.store);
  const onChange = vi.fn();

  const value = mount(() => {
    const observed = useObservableValue(source, 0, onChange);

    setSource(() => second.store);

    return observed;
  });

  expect(value()).toBe(2);
  expect(onChange.mock.calls).toEqual([]);

  second.set(3);

  expect(onChange.mock.calls).toEqual([[3]]);
});

test("the catch-up is told once, and a switch back to the first source tells nothing more", () => {
  const first = createStore(1);
  const second = createStore(5);
  const [source, setSource] = createSignal(first.store);
  const onChange = vi.fn();

  mount(() => {
    const observed = useObservableValue(source, 0, onChange);

    first.set(2);

    return observed;
  });

  setSource(() => second.store);
  setSource(() => first.store);

  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a callback that reads a signal while catching up is not resubscribed when that signal changes", () => {
  const { store, listeners, set } = createStore(1);
  const [label, setLabel] = createSignal("first");
  const heard = vi.fn();
  const subscribe = vi.spyOn(store, "subscribe");

  mount(() => {
    const observed = useObservableValue(
      () => store,
      0,
      (value) => {
        heard(value, label());
      },
    );

    set(2);

    return observed;
  });

  setLabel("second");

  expect(subscribe.mock.calls).toHaveLength(2);
  expect(listeners.size).toBe(2);
  expect(heard.mock.calls).toEqual([[2, "first"]]);
});
