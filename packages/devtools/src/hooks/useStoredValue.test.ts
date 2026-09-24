import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { useStoredValue } from "src/hooks/useStoredValue";

afterEach(() => {
  localStorage.clear();
});

const parseCount = (raw: unknown) => {
  if (typeof raw !== "number") {
    return 0;
  }

  return raw;
};

test("reads the stored value, writes updates, and follows other tabs", () => {
  localStorage.setItem("count", "3");
  localStorage.setItem("broken", "{");

  createRoot((dispose) => {
    const [count, setCount] = useStoredValue("count", parseCount, 0);
    const [broken] = useStoredValue("broken", parseCount, 7);
    const [missing] = useStoredValue("missing", parseCount, 5);

    expect(count()).toBe(3);
    expect(broken()).toBe(7);
    expect(missing()).toBe(5);

    setCount(4);
    expect(count()).toBe(4);
    expect(localStorage.getItem("count")).toBe("4");

    localStorage.setItem("count", "9");
    window.dispatchEvent(new StorageEvent("storage", { key: "count" }));
    expect(count()).toBe(9);

    localStorage.setItem("count", "11");
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
    expect(count()).toBe(9);
    dispose();
  });
});

test("storage that refuses a write keeps the value for this page", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException(
      "The quota has been exceeded.",
      "QuotaExceededError",
    );
  });

  createRoot((dispose) => {
    const [count, setCount] = useStoredValue("count", parseCount, 0);

    setCount(4);
    expect(count()).toBe(4);
    expect(localStorage.getItem("count")).toBeNull();
    dispose();
  });
});

test("a disposed owner stops following other tabs", () => {
  localStorage.setItem("count", "1");

  let read = () => 0;

  createRoot((dispose) => {
    const [count] = useStoredValue("count", parseCount, 0);

    read = count;
    dispose();
  });
  localStorage.setItem("count", "5");
  window.dispatchEvent(new StorageEvent("storage", { key: "count" }));

  expect(read()).toBe(1);
});
