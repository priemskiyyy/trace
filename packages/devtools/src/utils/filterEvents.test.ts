import { expect, test } from "vitest";

import type { RecordedEvent } from "src/types/internal/RecordedEvent";
import { createAcceptedRow } from "src/utils/createAcceptedRow.fixture";
import { createDiagnosticRow } from "src/utils/createDiagnosticRow.fixture";
import { filterEvents } from "src/utils/filterEvents";

const events = [
  createDiagnosticRow({
    id: 1,
    type: "event submitted",
    summary: "sdk-call-returned",
  }),
  createDiagnosticRow({
    id: 2,
    type: "event failed",
    kind: "ERROR",
    context: "null",
  }),
  createDiagnosticRow({
    id: 3,
    type: "event submitted",
    destination: { name: "backend" },
  }),
  createDiagnosticRow({
    id: 4,
    type: "event submitted",
    event: { id: "e_other" },
  }),
  createDiagnosticRow({
    id: 5,
    type: "event dropped",
    destination: null,
    kind: "ERROR",
    summary: "App Opened · not-routed",
  }),
  createDiagnosticRow({
    id: 6,
    type: "trace started",
    source: "runtime",
    destination: null,
    event: null,
    kind: "RUNTIME",
    context: '{\n  "timeout": 2000\n}',
  }),
  createAcceptedRow({
    id: 7,
    type: "Checkout Started",
    summary: "#1 · ada",
    values: '{\n  "properties": {\n    "plan": "hidden-plan"\n  }\n}',
  }),
];

const ids = (filtered: RecordedEvent[]) => filtered.map((entry) => entry.id);

test("a selected destination keeps its own events and the ones that belong to none", () => {
  expect(
    ids(
      filterEvents(events, { destination: "product", query: "", kind: null }),
    ),
  ).toEqual([1, 2, 4, 5, 6, 7]);
});

test("the search matches type, destination, event id, summary and context, and kinds narrow further", () => {
  const search = (query: string, kind: RecordedEvent["kind"] | null = null) =>
    ids(filterEvents(events, { destination: null, query, kind }));

  expect(search("FAILED")).toEqual([2]);
  expect(search("backend")).toEqual([3]);
  expect(search("e_other")).toEqual([4]);
  expect(search("not-routed")).toEqual([5]);
  expect(search("timeout")).toEqual([6]);
  expect(search("runtime")).toEqual([6]);
  expect(search("ada")).toEqual([7]);
  expect(search("started")).toEqual([6, 7]);
  expect(search("sdk-call")).toEqual([1]);
  expect(search("submitted", "ERROR")).toEqual([]);
  expect(search("", "ERROR")).toEqual([2, 5]);
  expect(search("  ")).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test("an event's values are never searched", () => {
  expect(
    ids(
      filterEvents(events, {
        destination: null,
        query: "hidden-plan",
        kind: null,
      }),
    ),
  ).toEqual([]);
});
