import { expect, test } from "vitest";

import { createOrdersBackend } from "example-shared/backend/createOrdersBackend";

const fakeEvent = (id: string, userId: string | null) => ({
  id,
  name: "Checkout Completed",
  properties: {},
  context: {},
  identity: {
    generation: 1,
    user: userId === null ? null : { id: userId },
    traits: {},
    groups: {},
  },
  timestamp: Date.now(),
});

test("an accepted request is logged and acknowledged with a short id", async () => {
  const backend = createOrdersBackend({ latency: 0 });
  const controller = new AbortController();

  const acknowledgement = await backend.request({
    event: fakeEvent("11112222-3333-4444-5555-666677778888", "nora"),
    signal: controller.signal,
  });

  expect(acknowledgement).toEqual({ id: "evt_11112222" });

  const [logged] = backend.requests.getSnapshot();

  expect(logged).toMatchObject({
    event: {
      id: "11112222-3333-4444-5555-666677778888",
      name: "Checkout Completed",
    },
    user: { id: "nora" },
    outcome: "accepted",
  });
});

test("offline fails every request until it is turned back on", async () => {
  const backend = createOrdersBackend({ latency: 0 });
  const controller = new AbortController();

  backend.setOffline(true);

  await expect(
    backend.request({
      event: fakeEvent("evt_1", "nora"),
      signal: controller.signal,
    }),
  ).rejects.toThrow("The orders endpoint answered 503.");
  expect(backend.requests.getSnapshot()[0]).toMatchObject({
    outcome: "failed",
  });

  backend.setOffline(false);

  await expect(
    backend.request({
      event: fakeEvent("evt_2", "nora"),
      signal: controller.signal,
    }),
  ).resolves.toMatchObject({ id: "evt_evt_2" });
});

test("failing the next request only fails once", async () => {
  const backend = createOrdersBackend({ latency: 0 });
  const controller = new AbortController();

  backend.failNextRequest();

  await expect(
    backend.request({
      event: fakeEvent("evt_1", "nora"),
      signal: controller.signal,
    }),
  ).rejects.toThrow("The orders endpoint answered 503.");
  await expect(
    backend.request({
      event: fakeEvent("evt_2", "nora"),
      signal: controller.signal,
    }),
  ).resolves.toMatchObject({ id: "evt_evt_2" });
});

test("a signal aborted before the request starts settles as aborted", async () => {
  const backend = createOrdersBackend({ latency: 1_000 });
  const controller = new AbortController();

  controller.abort(new Error("stopped"));

  await expect(
    backend.request({
      event: fakeEvent("evt_1", null),
      signal: controller.signal,
    }),
  ).rejects.toThrow("stopped");
  expect(backend.requests.getSnapshot()[0]).toMatchObject({
    user: null,
    outcome: "aborted",
  });
});
