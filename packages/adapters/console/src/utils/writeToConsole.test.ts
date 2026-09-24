import { afterEach, expect, test, vi } from "vitest";

import { EVENT, GROUP, IDENTIFY, TRAITS } from "src/calls.fixture";
import type { ConsoleEntry } from "src/types/ConsoleEntry";
import { writeToConsole } from "src/utils/writeToConsole";

afterEach(() => {
  vi.unstubAllGlobals();
});

test.each([
  {
    entry: { kind: "track", line: "[trace] track", event: EVENT },
    values: ["[trace] track", EVENT],
  },
  {
    entry: { kind: "identify", line: "[trace] identify", update: IDENTIFY },
    values: ["[trace] identify", IDENTIFY],
  },
  {
    entry: { kind: "traits", line: "[trace] traits", update: TRAITS },
    values: ["[trace] traits", TRAITS],
  },
  {
    entry: { kind: "group", line: "[trace] group", update: GROUP },
    values: ["[trace] group", GROUP],
  },
  {
    entry: { kind: "reset", line: "[trace] reset" },
    values: ["[trace] reset"],
  },
] satisfies { entry: ConsoleEntry; values: unknown[] }[])(
  "the $entry.kind entry goes to console.info with its line and the value it describes",
  ({ entry, values }) => {
    const info = vi
      .spyOn(globalThis.console, "info")
      .mockImplementation(() => {});

    writeToConsole(entry);

    expect(info.mock.calls).toStrictEqual([values]);
  },
);

test("the console is read on every write, so a console replaced later is the one written to", () => {
  const first = vi.fn();
  const second = vi.fn();

  vi.stubGlobal("console", { info: first });
  writeToConsole({ kind: "reset", line: "[trace] reset" });
  vi.stubGlobal("console", { info: second });
  writeToConsole({ kind: "reset", line: "[trace] reset" });

  expect(first.mock.calls).toStrictEqual([["[trace] reset"]]);
  expect(second.mock.calls).toStrictEqual([["[trace] reset"]]);
});
