import { expect, test } from "vitest";

import type { IdentityStep } from "src/types/internal/IdentityStep";
import type { StepAnswer } from "src/types/internal/StepAnswer";
import { getStepFailure } from "src/utils/internal/destinations/getStepFailure";
import { TraceError } from "src/utils/TraceError";

const RESET: IdentityStep = { kind: "reset" };

const STEPS: IdentityStep[] = [
  { kind: "identify", user: { id: "ada" } },
  { kind: "traits", user: null, set: { plan: "pro" }, remove: [] },
  {
    kind: "group",
    user: null,
    group: { type: "workspace", id: null, traits: {} },
  },
  RESET,
];

const threw = (error: unknown): StepAnswer => ({ kind: "THREW", error });

test("a step that answered did not fail, whatever it answered, and one that ran out of time failed as timeout", () => {
  expect(
    STEPS.map((step) => getStepFailure(step, { kind: "RESULT", value: 7 })),
  ).toEqual([null, null, null, null]);
  expect(
    STEPS.map((step) => getStepFailure(step, { kind: "TIMEOUT" })),
  ).toEqual(["timeout", "timeout", "timeout", "timeout"]);
});

test("an UNSUPPORTED throw counts as done for every step but a reset, which fails as unsupported", () => {
  const unsupported = threw(
    new TraceError({ code: "UNSUPPORTED", message: "The provider cannot." }),
  );

  expect(STEPS.map((step) => getStepFailure(step, unsupported))).toEqual([
    null,
    null,
    null,
    "unsupported",
  ]);
});

test("any other throw is an error, even one whose checks throw themselves", () => {
  const trapped = new Proxy(
    {},
    {
      getPrototypeOf: () => {
        throw new Error("prototype trap");
      },
    },
  );

  const answers = [
    threw(new Error("offline")),
    threw(new TraceError({ code: "DELIVERY_FAILED", message: "Lost." })),
    threw(trapped),
  ];

  expect(answers.map((answer) => getStepFailure(RESET, answer))).toEqual([
    "error",
    "error",
    "error",
  ]);
});
