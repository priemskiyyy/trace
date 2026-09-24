import { getContextLosses } from "src/utils/getContextLosses";
import { getContextNames } from "src/utils/getContextNames";
import { readField } from "src/utils/readField";

const formatText = (field: unknown) => {
  if (typeof field !== "string") {
    return "";
  }

  return field;
};

const formatNumber = (field: unknown, format: (value: number) => string) => {
  if (typeof field !== "number") {
    return "";
  }

  return format(field);
};

const formatFlag = (field: unknown, whenTrue: string, whenFalse: string) => {
  if (typeof field !== "boolean") {
    return "";
  }

  return field ? whenTrue : whenFalse;
};

const formatLossCount = (count: number) => {
  if (count === 0) {
    return "";
  }

  if (count === 1) {
    return "1 loss";
  }

  return `${count} losses`;
};

const formatUser = (field: unknown) => {
  if (field === null) {
    return "anonymous";
  }

  return formatText(readField(field, "id"));
};

const formatDecisions = (field: unknown) => {
  if (typeof field !== "object" || field === null) {
    return "";
  }

  return Object.entries(field)
    .flatMap(([purpose, decision]: [string, unknown]) => {
      if (typeof decision !== "string") {
        return [];
      }

      return [`${purpose} ${decision}`];
    })
    .join(", ");
};

const formatRefused = (names: string[]) => {
  if (names.length === 0) {
    return "";
  }

  return `refused ${names.join(", ")}`;
};

export const formatContextSummary = (value: unknown) => {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const read = (key: string) => readField(value, key);

  return [
    formatText(read("name")),
    formatText(read("step")),
    formatText(read("reason")),
    formatText(read("evidence")),
    getContextNames(value, "destinations").join(", "),
    formatLossCount(getContextLosses(value).length),
    formatNumber(read("generation"), (generation) => `#${generation}`),
    formatUser(read("user")),
    formatDecisions(read("decisions")),
    formatRefused(getContextNames(value, "refused")),
    formatText(read("path")),
    formatNumber(read("capacity"), (capacity) => `capacity ${capacity}`),
    formatNumber(read("timeout"), (timeout) => `${timeout} ms`),
    formatFlag(read("drained"), "drained", "not drained"),
    formatFlag(read("enabled"), "enabled", "disabled"),
  ]
    .flatMap((part) => {
      if (part === "") {
        return [];
      }

      return [part];
    })
    .join(" · ");
};
