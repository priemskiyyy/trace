import { expect, test } from "vitest";

import { readId } from "src/utils/internal/identity/readId";

test("an id is read as it is, and one that cannot be read is undefined", () => {
  const unreadable = {
    get id(): string {
      throw new Error("unreadable id");
    },
  };

  expect([readId({ id: "ada" }), readId(unreadable)]).toEqual([
    "ada",
    undefined,
  ]);
  // @ts-expect-error A JavaScript caller can pass an id that is not a string.
  expect(readId({ id: 7 })).toBe(7);
});
