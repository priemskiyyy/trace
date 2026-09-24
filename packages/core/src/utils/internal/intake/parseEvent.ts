import type { EventDefinition } from "src/types/EventDefinition";
import type { ParseResult } from "src/types/ParseResult";
import { isPlainObject } from "src/utils/common/isPlainObject";
import { getRefusal } from "src/utils/internal/schema/getRefusal";

const OUTSIDE_CONTRACT = "The event definition answered outside its contract.";

const copyIssues = (issues: { path: string; message: string }[]) => {
  const copied: { path: string; message: string }[] = [];

  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) {
      return null;
    }

    const { path, message } = issue;

    if (typeof path !== "string" || typeof message !== "string") {
      return null;
    }

    copied.push({ path, message });
  }

  return copied;
};

const getParsed = (
  definition: EventDefinition<unknown, unknown>,
  input: unknown,
): ParseResult<Record<string, unknown>> => {
  const answer = definition.parse(input);

  // A definition written in JavaScript can answer anything.
  if (typeof answer !== "object" || answer === null) {
    return getRefusal(OUTSIDE_CONTRACT);
  }

  if (answer.ok === true) {
    if (!isPlainObject(answer.properties)) {
      return getRefusal(OUTSIDE_CONTRACT);
    }

    return { ok: true, properties: answer.properties };
  }

  if (answer.ok === false) {
    const issues = Array.isArray(answer.issues)
      ? copyIssues(answer.issues)
      : null;

    if (issues === null) {
      return getRefusal(OUTSIDE_CONTRACT);
    }

    return { ok: false, issues };
  }

  return getRefusal(OUTSIDE_CONTRACT);
};

export const parseEvent = ({
  name,
  definition,
  input,
}: {
  name: string;
  definition: EventDefinition<unknown, unknown> | undefined;
  input: unknown;
}): ParseResult<Record<string, unknown>> => {
  if (definition === undefined) {
    return getRefusal(`Trace has no event named "${name}".`);
  }

  try {
    return getParsed(definition, input);
  } catch {
    return getRefusal("The event definition threw while parsing.");
  }
};
