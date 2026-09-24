import { afterEach, expect, test, vi } from "vitest";

import { createEventId } from "src/utils/internal/event/createEventId";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

test("an id is a version 4 UUID and no two are alike", () => {
  const ids = new Set(Array.from({ length: 200 }, createEventId));

  expect(ids.size).toBe(200);
  expect([...ids].every((id) => UUID.test(id))).toBe(true);
});

test.each([
  ["Hermes, which has no crypto", undefined],
  ["an insecure page, whose crypto has no randomUUID", {}],
])(
  "a runtime without crypto.randomUUID still gets valid ids: %s",
  (_, crypto) => {
    vi.stubGlobal("crypto", crypto);

    const ids = new Set(Array.from({ length: 200 }, createEventId));

    expect(ids.size).toBe(200);
    expect([...ids].every((id) => UUID.test(id))).toBe(true);
  },
);
