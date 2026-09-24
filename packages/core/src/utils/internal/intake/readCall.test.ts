import { expect, test } from "vitest";

import { readCall } from "src/utils/internal/intake/readCall";

const NO_CALL = { to: undefined, context: undefined, timestamp: undefined };

test("no options is a call with nothing to say", () => {
  expect([readCall(undefined), readCall(null)]).toEqual([NO_CALL, NO_CALL]);
});

test("options are read once each, and anything but the three is left behind", () => {
  const reads: string[] = [];

  const options = {
    get to() {
      reads.push("to");

      return ["product"];
    },
    get context() {
      reads.push("context");

      return { screen: "home" };
    },
    get timestamp() {
      reads.push("timestamp");

      return 1_000;
    },
    extra: "ignored",
  };

  expect(readCall(options)).toEqual({
    to: ["product"],
    context: { screen: "home" },
    timestamp: 1_000,
  });
  expect(reads).toEqual(["to", "context", "timestamp"]);
});

test("options that are not an object, are a list, or cannot be read are no call at all", () => {
  const { proxy, revoke } = Proxy.revocable({}, {});

  revoke();

  const unreadable = {
    get context(): never {
      throw new Error("unreadable context");
    },
  };

  expect(
    ["product", 42, true, ["product"], unreadable, proxy].map((options) =>
      readCall(options),
    ),
  ).toEqual([null, null, null, null, null, null]);
});
