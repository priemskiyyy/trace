import { expect, test } from "vitest";

import { getMixpanelValue } from "src/utils/getMixpanelValue";

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index);

test("numbers, booleans, null and strings within 255 characters are carried as they are", () => {
  expect(getMixpanelValue(42, "properties.value", 1, false)).toEqual({
    value: 42,
    losses: [],
  });
  expect(getMixpanelValue(true, "properties.paid", 1, false)).toEqual({
    value: true,
    losses: [],
  });
  expect(getMixpanelValue(null, "properties.coupon", 1, false)).toEqual({
    value: null,
    losses: [],
  });
  expect(
    getMixpanelValue("x".repeat(255), "properties.note", 1, false),
  ).toEqual({ value: "x".repeat(255), losses: [] });
});

test("a string over 255 characters is carried for Mixpanel to cut, as a truncated loss, whatever its bytes", () => {
  expect(
    getMixpanelValue("é".repeat(255), "properties.note", 1, false),
  ).toEqual({ value: "é".repeat(255), losses: [] });
  expect(
    getMixpanelValue("é".repeat(256), "properties.note", 1, false),
  ).toEqual({
    value: "é".repeat(256),
    losses: [{ path: "properties.note", reason: "truncated" }],
  });
  expect(
    getMixpanelValue("x".repeat(256), "properties.note", 1, false),
  ).toEqual({
    value: "x".repeat(256),
    losses: [{ path: "properties.note", reason: "truncated" }],
  });
});

test("a list keeps its first 254 items, and each item after them is a truncated loss", () => {
  expect(getMixpanelValue(range(256), "properties.ids", 1, false)).toEqual({
    value: range(254),
    losses: [
      { path: "properties.ids.254", reason: "truncated" },
      { path: "properties.ids.255", reason: "truncated" },
    ],
  });
});

test("an object keeps its first 254 keys, and each key after them is a truncated loss", () => {
  const object = Object.fromEntries(
    range(256).map((index) => [`k${index}`, index]),
  );

  expect(getMixpanelValue(object, "properties.scores", 1, false)).toEqual({
    value: Object.fromEntries(range(254).map((index) => [`k${index}`, index])),
    losses: [
      { path: "properties.scores.k254", reason: "truncated" },
      { path: "properties.scores.k255", reason: "truncated" },
    ],
  });
});

test("objects nest three levels deep, and an object below them is left out as unsupported", () => {
  expect(
    getMixpanelValue({ b: { c: { d: 1 } } }, "properties.a", 1, false),
  ).toEqual({ value: { b: { c: { d: 1 } } }, losses: [] });
  expect(
    getMixpanelValue(
      { b: { c: { d: { e: 1 }, f: [1] } } },
      "properties.a",
      1,
      false,
    ),
  ).toEqual({
    value: { b: { c: { f: [1] } } },
    losses: [{ path: "properties.a.b.c.d", reason: "unsupported" }],
  });
});

test("a list does not count as a level, so an object in it is as deep as the list's parent object plus one", () => {
  expect(
    getMixpanelValue({ b: { c: [{ x: 1 }] } }, "properties.a", 1, false),
  ).toEqual({ value: { b: { c: [{ x: 1 }] } }, losses: [] });
  expect(
    getMixpanelValue(
      { b: { c: { d: [{ x: 1 }, 2] } } },
      "properties.a",
      1,
      false,
    ),
  ).toEqual({
    value: { b: { c: { d: [2] } } },
    losses: [{ path: "properties.a.b.c.d.0", reason: "unsupported" }],
  });
});

test("an object in a list holds no nested object or list, which is left out as unsupported", () => {
  expect(
    getMixpanelValue(
      [{ sku: "sku_1", attributes: { color: "red" }, tags: ["sale"] }],
      "properties.items",
      1,
      false,
    ),
  ).toEqual({
    value: [{ sku: "sku_1" }],
    losses: [
      { path: "properties.items.0.attributes", reason: "unsupported" },
      { path: "properties.items.0.tags", reason: "unsupported" },
    ],
  });
});

test("a list inside a list is carried, and its items keep the limits of their kind", () => {
  expect(
    getMixpanelValue([[1, 2], ["x".repeat(256)]], "properties.grid", 1, false),
  ).toEqual({
    value: [[1, 2], ["x".repeat(256)]],
    losses: [{ path: "properties.grid.1.0", reason: "truncated" }],
  });
});

test("a key longer than 255 characters is a truncated loss, and a path carries one loss even when its string is cut too", () => {
  const long = "k".repeat(256);
  const longer = "m".repeat(256);

  expect(
    getMixpanelValue(
      { [long]: 1, [longer]: "x".repeat(256), ["n".repeat(255)]: 2 },
      "properties.labels",
      1,
      false,
    ),
  ).toEqual({
    value: { [long]: 1, [longer]: "x".repeat(256), ["n".repeat(255)]: 2 },
    losses: [
      { path: `properties.labels.${long}`, reason: "truncated" },
      { path: `properties.labels.${longer}`, reason: "truncated" },
    ],
  });
});
