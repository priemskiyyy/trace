import type {
  TraceDiagnosticEvent,
  TraceDiagnosticType,
} from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import type { RecordedEventKind } from "src/types/internal/RecordedEventKind";
import { getEventKind } from "src/utils/getEventKind";

const CLOSED_LIST: [
  TraceDiagnosticType,
  TraceDiagnosticEvent["source"],
  RecordedEventKind,
][] = [
  ["trace started", "runtime", "RUNTIME"],
  ["trace disposed", "runtime", "RUNTIME"],
  ["destination ready", "destination", "DESTINATION"],
  ["destination failed", "destination", "ERROR"],
  ["destination disposed", "destination", "DESTINATION"],
  ["destination dispose failed", "destination", "ERROR"],
  ["destination collection failed", "destination", "ERROR"],
  ["user changed", "identity", "IDENTITY"],
  ["user refused", "identity", "ERROR"],
  ["group refused", "identity", "ERROR"],
  ["traits refused", "identity", "ERROR"],
  ["context refused", "runtime", "ERROR"],
  ["identity step failed", "identity", "ERROR"],
  ["identity step unsupported", "identity", "IDENTITY"],
  ["consent changed", "consent", "CONSENT"],
  ["event accepted", "event", "EVENT"],
  ["event dropped", "event", "EVENT"],
  ["event submitted", "event", "EVENT"],
  ["event failed", "event", "ERROR"],
  ["event skipped", "event", "EVENT"],
  ["event indeterminate", "event", "EVENT"],
  ["buffer overflow", "destination", "ERROR"],
  ["flush started", "runtime", "RUNTIME"],
  ["flush completed", "runtime", "RUNTIME"],
  ["listener failed", "event", "ERROR"],
];

test("the failures, a buffer overflow and the refusals are errors, and every other phrase is filed under the source that records it", () => {
  expect(
    CLOSED_LIST.map(([type, source]) => [
      type,
      source,
      getEventKind({ source, type }),
    ]),
  ).toEqual(CLOSED_LIST);
});

test("a phrase outside the closed list is filed under its source, even one that reads like a failure or names a key every object inherits", () => {
  expect(
    // @ts-expect-error A value from JavaScript can be outside the closed list.
    getEventKind({ source: "runtime", type: "network failed" }),
  ).toBe("RUNTIME");
  expect(
    // @ts-expect-error A value from JavaScript can name a key every object inherits.
    getEventKind({ source: "destination", type: "toString" }),
  ).toBe("DESTINATION");
  expect(
    // @ts-expect-error A value from JavaScript can name the prototype key.
    getEventKind({ source: "identity", type: "__proto__" }),
  ).toBe("IDENTITY");
});

test("a source outside the closed list fails loudly", () => {
  expect(() =>
    // @ts-expect-error A value from JavaScript can be outside the union.
    getEventKind({ source: "network", type: "network changed" }),
  ).toThrow(new Error('Unexpected value: "network"'));
});
