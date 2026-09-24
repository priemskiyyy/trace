import { expect, test } from "vitest";

import { assertUnreachable } from "src/utils/assertUnreachable";

type Position = "bottom" | "right";

type Action = { kind: "OPEN" } | { kind: "CLOSE"; after: number };

const describePosition = (position: Position) => {
  if (position === "bottom") {
    return "docked to the bottom";
  }

  if (position === "right") {
    return "docked to the right";
  }

  return assertUnreachable(position);
};

const describeAction = (action: Action) => {
  if (action.kind === "OPEN") {
    return "open";
  }

  if (action.kind === "CLOSE") {
    return `close after ${action.after}`;
  }

  return assertUnreachable(action);
};

test("every declared variant is handled before the unreachable branch", () => {
  expect(describePosition("bottom")).toBe("docked to the bottom");
  expect(describePosition("right")).toBe("docked to the right");
  expect(describeAction({ kind: "OPEN" })).toBe("open");
  expect(describeAction({ kind: "CLOSE", after: 3 })).toBe("close after 3");
});

test("a value that slipped past the types fails loudly and is named", () => {
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describePosition("top")).toThrow(
    new Error('Unexpected value: "top"'),
  );
});

test("an object variant is printed, never as [object Object]", () => {
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describeAction({ kind: "TOGGLE_PAUSE" })).toThrow(
    new Error('Unexpected value: {"kind":"TOGGLE_PAUSE"}'),
  );
});

test("a variant JSON cannot print still throws a readable error", () => {
  const circular: { kind: "RESIZE"; self?: unknown } = { kind: "RESIZE" };

  circular.self = circular;

  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describeAction(circular)).toThrow(
    new Error("Unexpected value: [object Object]"),
  );
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describePosition(undefined)).toThrow(
    new Error("Unexpected value: undefined"),
  );
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describePosition(7n)).toThrow(new Error("Unexpected value: 7"));
});
