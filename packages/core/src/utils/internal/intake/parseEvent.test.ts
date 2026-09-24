import { expect, test } from "vitest";

import type { EventDefinition } from "src/types/EventDefinition";
import { event } from "src/utils/event";
import { parseEvent } from "src/utils/internal/intake/parseEvent";

const searchPerformed: EventDefinition<unknown, unknown> = event<{
  query: string;
}>();

const answering = (answer: unknown): EventDefinition<unknown, unknown> => ({
  // @ts-expect-error A definition written in JavaScript can answer anything.
  parse: () => answer,
});

const parse = (overrides: Partial<Parameters<typeof parseEvent>[0]> = {}) =>
  parseEvent({
    name: "Search Performed",
    definition: searchPerformed,
    input: { query: "shoes" },
    ...overrides,
  });

test("properties the definition accepts are the ones it answered", () => {
  const input = { query: "shoes" };
  const parsed = parse({ input });

  expect(parsed).toEqual({ ok: true, properties: { query: "shoes" } });
  expect(parsed.ok ? parsed.properties : null).toBe(input);
});

test("an event nobody declared is invalid, with an issue that names it", () => {
  expect(parse({ name: "Wishlist Shared", definition: undefined })).toEqual({
    ok: false,
    issues: [
      { path: "", message: 'Trace has no event named "Wishlist Shared".' },
    ],
  });
});

test("properties the definition refuses are invalid, with the definition's own issues", () => {
  expect(parse({ input: "shoes" })).toEqual({
    ok: false,
    issues: [{ path: "", message: "Expected an object of event properties." }],
  });
  expect(
    parse({
      definition: answering({
        ok: false,
        issues: [{ path: "cart.id", message: "Required" }],
      }),
    }),
  ).toEqual({
    ok: false,
    issues: [{ path: "cart.id", message: "Required" }],
  });
});

test("a definition that throws is invalid, and its error never reaches the caller", () => {
  const definition: EventDefinition<unknown, unknown> = {
    parse: () => {
      throw new Error("generated constructor exploded");
    },
  };

  expect(parse({ definition })).toEqual({
    ok: false,
    issues: [
      { path: "", message: "The event definition threw while parsing." },
    ],
  });
});

test.each([
  ["nothing", undefined],
  ["a string", "shoes"],
  ["a success without properties", { ok: true }],
  ["properties that are not an object", { ok: true, properties: 5 }],
  ["properties that are a list", { ok: true, properties: ["shoes"] }],
  [
    "properties that are a class instance",
    { ok: true, properties: new (class Search {})() },
  ],
  ["issues that are not a list", { ok: false, issues: "Required" }],
  [
    "issues that are one issue",
    { ok: false, issues: { path: "", message: "Required" } },
  ],
  ["an issue that is not an object", { ok: false, issues: [null] }],
  ["an issue without a path", { ok: false, issues: [{ message: "Required" }] }],
  ["an issue without a message", { ok: false, issues: [{ path: "cart" }] }],
  ["an ok that is neither", { ok: "yes", properties: {} }],
  ["a promise", Promise.resolve({ ok: true, properties: {} })],
])("a definition that answers %s is invalid", (_, answer) => {
  expect(parse({ definition: answering(answer) })).toEqual({
    ok: false,
    issues: [
      {
        path: "",
        message: "The event definition answered outside its contract.",
      },
    ],
  });
});

test("an answer whose fields throw when read is invalid instead of throwing", () => {
  const answer = {
    get ok(): boolean {
      throw new Error("unreadable answer");
    },
  };

  const issue = {
    get path(): string {
      throw new Error("unreadable path");
    },
    message: "Required",
  };

  for (const unreadable of [answer, { ok: false, issues: [issue] }]) {
    expect(parse({ definition: answering(unreadable) })).toEqual({
      ok: false,
      issues: [
        { path: "", message: "The event definition threw while parsing." },
      ],
    });
  }
});

test("the issues are copied, so a definition that changes them later changes nothing", () => {
  const issues = [{ path: "cart.id", message: "Required" }];
  const parsed = parse({ definition: answering({ ok: false, issues }) });

  issues[0] = { path: "changed", message: "changed" };

  expect(parsed).toEqual({
    ok: false,
    issues: [{ path: "cart.id", message: "Required" }],
  });
});
