import { expect, test } from "vitest";

import { formatCounters } from "src/formatting/formatCounters";

test("the header counts the identity generation, names the user and counts the pending receipts", () => {
  expect(
    formatCounters({
      identity: { generation: 0, user: null },
      pendingReceipts: 0,
    }),
  ).toBe("generation #0 · anonymous · 0 pending");
  expect(
    formatCounters({
      identity: { generation: 4, user: { id: "ada" } },
      pendingReceipts: 12,
    }),
  ).toBe("generation #4 · ada · 12 pending");
});
