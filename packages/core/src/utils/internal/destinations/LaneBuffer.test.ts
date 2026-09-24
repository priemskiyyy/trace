import { afterEach, expect, test, vi } from "vitest";

import { LaneBuffer } from "src/utils/internal/destinations/LaneBuffer";

afterEach(() => {
  vi.useRealTimers();
});

const create = (
  options: { capacity?: number; maxAge?: number; now?: () => number } = {},
) => {
  const dropped: { entry: string; reason: "overflow" | "expired" }[] = [];

  const buffer = new LaneBuffer<string>({
    capacity: options.capacity ?? 10,
    maxAge: options.maxAge ?? 60_000,
    now: options.now ?? (() => Date.now()),
    drop: (entry, reason) => {
      dropped.push({ entry, reason });
    },
  });

  return { buffer, dropped };
};

test("a buffer under its capacity hands its entries back in acceptance order", () => {
  const { buffer, dropped } = create();

  buffer.push("first");
  buffer.push("second");

  expect(buffer.size()).toBe(2);
  expect(buffer.values()).toEqual(["first", "second"]);
  expect(buffer.shift()).toBe("first");
  expect(buffer.shift()).toBe("second");
  expect(buffer.shift()).toBeNull();
  expect(buffer.size()).toBe(0);
  expect(dropped).toEqual([]);
});

test("a full buffer drops its oldest entry and says so", () => {
  const { buffer, dropped } = create({ capacity: 2 });

  buffer.push("first");
  buffer.push("second");
  buffer.push("third");

  expect(dropped).toEqual([{ entry: "first", reason: "overflow" }]);
  expect(buffer.values()).toEqual(["second", "third"]);
});

test("a buffer with no capacity drops every entry it is given", () => {
  const { buffer, dropped } = create({ capacity: 0 });

  buffer.push("first");
  buffer.push("second");

  expect(dropped).toEqual([
    { entry: "first", reason: "overflow" },
    { entry: "second", reason: "overflow" },
  ]);
  expect(buffer.size()).toBe(0);
});

test("an entry that grows past its age is dropped, so its receipt can settle", () => {
  vi.useFakeTimers();

  const { buffer, dropped } = create({ maxAge: 1_000 });

  buffer.push("old");
  vi.advanceTimersByTime(600);
  buffer.push("young");
  vi.advanceTimersByTime(399);

  expect(dropped).toEqual([]);

  vi.advanceTimersByTime(1);

  expect(dropped).toEqual([{ entry: "old", reason: "expired" }]);
  expect(buffer.values()).toEqual(["young"]);

  vi.advanceTimersByTime(600);

  expect(dropped).toEqual([
    { entry: "old", reason: "expired" },
    { entry: "young", reason: "expired" },
  ]);
  expect(buffer.size()).toBe(0);
});

test("one timer serves the whole buffer, however many entries wait", () => {
  vi.useFakeTimers();

  const { buffer } = create({ maxAge: 1_000 });

  buffer.push("first");
  buffer.push("second");
  buffer.push("third");

  expect(vi.getTimerCount()).toBe(1);

  buffer.shift();

  expect(vi.getTimerCount()).toBe(1);
});

test("the buffer's timer is unreferenced, so a waiting entry never keeps a process alive", () => {
  const scheduled = vi.spyOn(globalThis, "setTimeout");
  const { buffer } = create({ maxAge: 60_000 });

  buffer.push("first");
  buffer.shift();
  buffer.push("second");

  const timers = scheduled.mock.results.flatMap((result) => {
    if (result.type !== "return") {
      return [];
    }

    return [result.value];
  });

  buffer.remove(() => true);

  expect(timers).toHaveLength(2);
  expect(timers.map((timer) => timer.hasRef())).toEqual([false, false]);
});

test("removing entries hands them back in order and leaves the rest waiting with their ages", () => {
  vi.useFakeTimers();

  const { buffer, dropped } = create({ maxAge: 1_000 });

  buffer.push("keep-1");
  buffer.push("take-1");
  vi.advanceTimersByTime(500);
  buffer.push("take-2");
  buffer.push("keep-2");

  expect(buffer.remove((entry) => entry.startsWith("take"))).toEqual([
    "take-1",
    "take-2",
  ]);
  expect(buffer.values()).toEqual(["keep-1", "keep-2"]);

  vi.advanceTimersByTime(500);

  expect(dropped).toEqual([{ entry: "keep-1", reason: "expired" }]);

  vi.advanceTimersByTime(500);

  expect(dropped).toEqual([
    { entry: "keep-1", reason: "expired" },
    { entry: "keep-2", reason: "expired" },
  ]);
});

test("removing everything stops the timer, so nothing expires afterwards", () => {
  vi.useFakeTimers();

  const { buffer, dropped } = create({ maxAge: 1_000 });

  buffer.push("first");
  buffer.push("second");

  expect(buffer.remove(() => true)).toEqual(["first", "second"]);
  expect(vi.getTimerCount()).toBe(0);

  vi.advanceTimersByTime(5_000);

  expect(dropped).toEqual([]);
});

test("a clock that went backwards re-bases the waiting entries, so they wait their age from the new time", () => {
  vi.useFakeTimers();

  let time = 10_000;

  const { buffer, dropped } = create({ maxAge: 1_000, now: () => time });

  buffer.push("before");
  time = 0;
  buffer.push("after");
  vi.advanceTimersByTime(999);

  expect(dropped).toEqual([]);

  time = 1_000;
  vi.advanceTimersByTime(1);

  expect(dropped).toEqual([
    { entry: "before", reason: "expired" },
    { entry: "after", reason: "expired" },
  ]);
});

test("a clock that went backwards while the timer ran re-bases the entry rather than keeping it for as long as the clock jumped", () => {
  vi.useFakeTimers();

  let time = 10_000;

  const { buffer, dropped } = create({ maxAge: 1_000, now: () => time });

  buffer.push("waiting");
  time = 500;
  vi.advanceTimersByTime(1_000);

  expect(dropped).toEqual([]);

  time = 1_499;
  vi.advanceTimersByTime(999);

  expect(dropped).toEqual([]);

  time = 1_500;
  vi.advanceTimersByTime(1);

  expect(dropped).toEqual([{ entry: "waiting", reason: "expired" }]);
});
