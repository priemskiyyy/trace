import { expect, test } from "vitest";

import { getItems } from "src/utils/getItems";

const getCustom = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`custom_${index}`, index]),
  );

test("an item keeps Firebase's item fields and up to 27 custom parameters as they are", () => {
  const item = {
    item_id: "sku_1",
    item_name: "Tee",
    price: 20,
    quantity: 1,
    ...getCustom(27),
  };

  expect(getItems([item])).toEqual({ items: [item], losses: [] });
});

test("the 27 custom parameters are counted per item: a full item stays whole, and the next one's past 27 are left out, reported truncated once at that item", () => {
  const full = { item_id: "sku_1", ...getCustom(27) };
  const over = { item_id: "sku_2", ...getCustom(29) };

  expect(getItems([full, over])).toEqual({
    items: [full, { item_id: "sku_2", ...getCustom(27) }],
    losses: [{ path: "items.1", reason: "truncated" }],
  });
});

test("a nested value inside an item is left out as unsupported at its path, and takes no custom slot", () => {
  const item = {
    item_id: "sku_1",
    size: { eu: 42 },
    ...getCustom(27),
    tags: ["summer"],
  };

  expect(getItems([item])).toEqual({
    items: [{ item_id: "sku_1", ...getCustom(27) }],
    losses: [
      { path: "items.0.size", reason: "unsupported" },
      { path: "items.0.tags", reason: "unsupported" },
    ],
  });
});

test("an item key named after a prototype member is a custom parameter, never a prescribed one", () => {
  const item = { item_id: "sku_1", ...getCustom(27), toString: "x" };

  expect(getItems([item])).toEqual({
    items: [{ item_id: "sku_1", ...getCustom(27) }],
    losses: [{ path: "items.0", reason: "truncated" }],
  });
});

test("the list keeps GA4's 200 entries, and a longer one is cut to its first 200 and reported truncated before the items' own losses", () => {
  const items = Array.from({ length: 201 }, (_, index) => ({
    item_id: `sku_${index}`,
  }));

  const sized = { item_id: "sku_sized", size: { eu: 42 } };

  expect(getItems(items.slice(0, 200))).toEqual({
    items: items.slice(0, 200),
    losses: [],
  });
  expect(getItems([sized, ...items])).toEqual({
    items: [{ item_id: "sku_sized" }, ...items.slice(0, 199)],
    losses: [
      { path: "items", reason: "truncated" },
      { path: "items.0.size", reason: "unsupported" },
    ],
  });
});
