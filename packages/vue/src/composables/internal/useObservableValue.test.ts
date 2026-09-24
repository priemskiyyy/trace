import type { ObservableValue } from "@priemskiyyy/trace";
import { mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, onBeforeMount, shallowRef } from "vue";
import type { RenderFunction } from "vue";

import { useObservableValue } from "src/composables/internal/useObservableValue";

const views = new Set<{ unmount: () => void }>();

afterEach(() => {
  for (const view of views) {
    view.unmount();
  }

  views.clear();
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

const render = (setup: () => RenderFunction) => {
  const view = mount(defineComponent(setup));

  views.add(view);

  return view;
};

test("the callback gets a listener of its own only when one is given", async () => {
  const { store, listeners, set } = createStore(1);
  const onChange = vi.fn();

  const view = render(() => {
    const value = useObservableValue(() => store, 0);

    return () => h("span", String(value.value));
  });

  expect(listeners.size).toBe(1);

  render(() => {
    useObservableValue(() => store, 0, onChange);

    return () => null;
  });

  expect(listeners.size).toBe(3);

  set(2);
  await nextTick();

  expect(view.text()).toBe("2");
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("the value is the source's own, never a copy or a proxy", async () => {
  const first = { state: "first" };
  const second = { state: "second" };
  const { store, set } = createStore(first);
  const read = vi.fn();

  render(() => {
    const value = useObservableValue(() => store, first);

    return () => {
      read(value.value);

      return null;
    };
  });

  set(second);
  await nextTick();

  expect(read.mock.calls).toHaveLength(2);
  expect(read.mock.calls[0]?.[0]).toBe(first);
  expect(read.mock.calls[1]?.[0]).toBe(second);
});

test("until it is mounted the value reads its initial one, whatever the source holds", async () => {
  const { store } = createStore(1);
  const read = vi.fn();

  const view = render(() => {
    const value = useObservableValue(() => store, 0);

    read(value.value);

    return () => h("span", String(value.value));
  });

  expect(read.mock.calls).toEqual([[0]]);
  expect(view.text()).toBe("0");

  await nextTick();

  expect(view.text()).toBe("1");
});

test("a replaced source moves the value and both listeners to it, and the switch tells the callback nothing", async () => {
  const first = createStore(1);
  const second = createStore(2);
  const source = shallowRef(first.store);
  const onChange = vi.fn();

  const view = render(() => {
    const value = useObservableValue(() => source.value, 0, onChange);

    return () => h("span", String(value.value));
  });

  source.value = second.store;

  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(2);

  await nextTick();

  expect(view.text()).toBe("2");
  expect(onChange.mock.calls).toEqual([]);

  second.set(3);
  await nextTick();

  expect(view.text()).toBe("3");
  expect(onChange.mock.calls).toEqual([[3]]);
});

test("a change made between setup and the callback's listener is told once", async () => {
  const { store, set } = createStore(1);
  const onChange = vi.fn();

  const view = render(() => {
    const value = useObservableValue(() => store, 0, onChange);

    onBeforeMount(() => {
      set(2);
    });

    return () => h("span", String(value.value));
  });

  await nextTick();

  expect(view.text()).toBe("2");
  expect(onChange.mock.calls).toEqual([[2]]);
});

test("a source replaced between setup and the callback's listener tells the callback nothing", async () => {
  const first = createStore(1);
  const second = createStore(2);
  const source = shallowRef(first.store);
  const onChange = vi.fn();

  const view = render(() => {
    const value = useObservableValue(() => source.value, 0, onChange);

    onBeforeMount(() => {
      source.value = second.store;
    });

    return () => h("span", String(value.value));
  });

  await nextTick();

  expect(view.text()).toBe("2");
  expect(onChange.mock.calls).toEqual([]);

  second.set(3);

  expect(onChange.mock.calls).toEqual([[3]]);
});

test("the catch-up is told once, and a switch back to the source setup read tells nothing more", () => {
  const first = createStore(1);
  const second = createStore(5);
  const source = shallowRef(first.store);
  const onChange = vi.fn();

  render(() => {
    useObservableValue(() => source.value, 0, onChange);

    onBeforeMount(() => {
      first.set(2);
    });

    return () => null;
  });

  source.value = second.store;
  source.value = first.store;

  expect(onChange.mock.calls).toEqual([[2]]);
});
