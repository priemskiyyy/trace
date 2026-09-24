import { expect, test } from "vitest";

import { assertUnreachable } from "src/utils/common/assertUnreachable";

type Verdict = "granted" | "denied";

type Step = { kind: "reset" } | { kind: "identify"; user: { id: string } };

const describeVerdict = (verdict: Verdict) => {
  if (verdict === "granted") {
    return "a grant";
  }

  if (verdict === "denied") {
    return "a refusal";
  }

  return assertUnreachable(verdict);
};

const describeStep = (step: Step) => {
  if (step.kind === "reset") {
    return "a reset";
  }

  if (step.kind === "identify") {
    return `an identify of ${step.user.id}`;
  }

  return assertUnreachable(step);
};

test("every declared variant is handled before the unreachable branch", () => {
  expect(describeVerdict("granted")).toBe("a grant");
  expect(describeVerdict("denied")).toBe("a refusal");
  expect(describeStep({ kind: "reset" })).toBe("a reset");
  expect(describeStep({ kind: "identify", user: { id: "ada" } })).toBe(
    "an identify of ada",
  );
});

test("a value that slipped past the types fails loudly and is named", () => {
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describeVerdict("maybe")).toThrow(
    new Error('Unexpected value: "maybe"'),
  );
});

test("an object variant is printed, never as [object Object]", () => {
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describeStep({ kind: "group", type: "workspace" })).toThrow(
    new Error('Unexpected value: {"kind":"group","type":"workspace"}'),
  );
});

test("a variant JSON cannot print still throws a readable error", () => {
  const circular: { kind: "group"; self?: unknown } = { kind: "group" };

  circular.self = circular;

  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describeStep(circular)).toThrow(
    new Error("Unexpected value: [object Object]"),
  );
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describeVerdict(undefined)).toThrow(
    new Error("Unexpected value: undefined"),
  );
  // @ts-expect-error A value from JavaScript can be outside the union.
  expect(() => describeVerdict(7n)).toThrow(new Error("Unexpected value: 7"));
});
