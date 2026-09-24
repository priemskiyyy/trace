import { expect, test, vi } from "vitest";

import type { AnalyticsSession } from "src/types/AnalyticsSession";
import type { IdentityStep } from "src/types/internal/IdentityStep";
import { callIdentityStep } from "src/utils/internal/destinations/callIdentityStep";

const ADA = { id: "ada" };

const STEPS: IdentityStep[] = [
  { kind: "reset" },
  { kind: "identify", user: ADA },
  { kind: "traits", user: ADA, set: { plan: "pro" }, remove: ["role"] },
  {
    kind: "group",
    user: ADA,
    group: { type: "workspace", id: "w_1", traits: { seats: 3 } },
  },
];

test("each step calls its method with a frozen update and answers what the method answered", () => {
  const answered = Promise.resolve();
  const reset = vi.fn(() => answered);
  const identify = vi.fn();
  const traits = vi.fn();
  const group = vi.fn();

  const session: AnalyticsSession = {
    native: null,
    track: () => ({ status: "submitted", evidence: "sdk-call-returned" }),
    reset,
    identify,
    traits,
    group,
  };

  const answers = STEPS.map((step) => callIdentityStep(session, step));

  expect(answers).toEqual([answered, undefined, undefined, undefined]);
  expect(answers[0]).toBe(answered);
  expect(
    [reset, identify, traits, group].map(({ mock }) => mock.calls),
  ).toEqual([
    [[]],
    [[{ user: ADA }]],
    [[{ user: ADA, set: { plan: "pro" }, remove: ["role"] }]],
    [
      [
        {
          user: ADA,
          group: { type: "workspace", id: "w_1", traits: { seats: 3 } },
        },
      ],
    ],
  ]);
  expect(
    [identify, traits, group].map(({ mock }) =>
      Object.isFrozen(mock.calls[0]?.[0]),
    ),
  ).toEqual([true, true, true]);
});

test("a step whose method the session lacks throws TraceError UNSUPPORTED", () => {
  const session: AnalyticsSession = {
    native: null,
    track: () => ({ status: "submitted", evidence: "sdk-call-returned" }),
  };

  for (const step of STEPS) {
    expect(() => callIdentityStep(session, step)).toThrow(
      expect.objectContaining({
        name: "TraceError",
        code: "UNSUPPORTED",
        message: "The session has no method for this identity step.",
      }),
    );
  }
});
