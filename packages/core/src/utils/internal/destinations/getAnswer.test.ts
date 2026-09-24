import { expect, test } from "vitest";

import { getAnswer } from "src/utils/internal/destinations/getAnswer";

test("a value that is not a thenable is the result itself, whatever it is", () => {
  const submitted = { status: "submitted", evidence: "sdk-call-returned" };
  const values = [submitted, undefined, null, "submitted", { then: "later" }];

  expect(values.map(getAnswer)).toEqual(
    values.map((value) => ({ kind: "RESULT", value })),
  );
  expect(getAnswer(submitted)).toEqual({ kind: "RESULT", value: submitted });
});

test("a function is a result even when it has a then, because no contract answers with one", () => {
  const callable = Object.assign(() => "called", {
    then: (resolve: (value: string) => void) => resolve("adopted"),
  });

  expect(getAnswer(callable)).toEqual({ kind: "RESULT", value: callable });
});

test("a promise or a foreign thenable is pending, and its promise settles as the thenable does", async () => {
  const failure = new Error("rejected");

  const answers = [
    getAnswer(Promise.resolve("native")),
    getAnswer({
      then: (resolve: (value: string) => void) => resolve("foreign"),
    }),
    getAnswer(Promise.reject(failure)),
  ];

  expect(answers.map(({ kind }) => kind)).toEqual([
    "PENDING",
    "PENDING",
    "PENDING",
  ]);
  await expect(
    Promise.allSettled(
      answers.map((answer) =>
        answer.kind === "PENDING" ? answer.promise : null,
      ),
    ),
  ).resolves.toEqual([
    { status: "fulfilled", value: "native" },
    { status: "fulfilled", value: "foreign" },
    { status: "rejected", reason: failure },
  ]);
});

test("a then that cannot be read throws for the caller to contain, and a promise's constructor is only read later, as a rejection", async () => {
  const thrown = new Error("then exploded");

  expect(() =>
    getAnswer({
      get then() {
        throw thrown;
      },
    }),
  ).toThrow(thrown);

  const promise = Promise.resolve("late");

  Object.defineProperty(promise, "constructor", {
    get() {
      throw new Error("constructor read");
    },
  });

  const answer = getAnswer(promise);

  expect(answer.kind).toBe("PENDING");
  await expect(
    answer.kind === "PENDING" ? answer.promise : null,
  ).rejects.toThrow("constructor read");
});
