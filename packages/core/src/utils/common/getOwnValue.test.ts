import { expect, test } from "vitest";

import { getOwnValue } from "src/utils/common/getOwnValue";

test("an own value is read, even under a prototype key's name, and an absent or inherited key reads as undefined", () => {
  const record: Record<string, unknown> = { plan: "pro", role: null };

  const prototypeNamed = Object.fromEntries([
    ["__proto__", "own"],
    ["constructor", "own"],
  ]);

  expect(getOwnValue(record, "plan")).toBe("pro");
  expect(getOwnValue(record, "role")).toBeNull();
  expect(getOwnValue(record, "seats")).toBeUndefined();
  expect(getOwnValue(record, "toString")).toBeUndefined();
  expect(getOwnValue(record, "__proto__")).toBeUndefined();
  expect(getOwnValue(prototypeNamed, "__proto__")).toBe("own");
  expect(getOwnValue(prototypeNamed, "constructor")).toBe("own");
});
