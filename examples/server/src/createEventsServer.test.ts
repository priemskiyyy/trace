import { expect, test } from "vitest";
import { createEventsServer } from "src/createEventsServer";

const listen = async () => {
  const host = createEventsServer();

  await new Promise<void>((resolve, reject) => {
    host.server.once("error", reject);
    host.server.listen(0, "127.0.0.1", resolve);
  });

  const address = host.server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected a TCP listener.");
  }

  return { ...host, origin: `http://127.0.0.1:${address.port}` };
};

const post = (origin: string, path: string, body: unknown) =>
  fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const trackedEvent = (overrides: {
  user?: { id: string } | null;
  groups?: Record<string, { id: string; traits: Record<string, unknown> }>;
}) => ({
  id: "evt_1",
  name: "Checkout Started",
  properties: { cart: { id: "cart_1" }, value: 49.5 },
  context: { locale: "en-US" },
  identity: {
    generation: 1,
    user: overrides.user ?? null,
    traits: {},
    groups: overrides.groups ?? {},
  },
  timestamp: 1_700_000_000_000,
});

test("a signed-in event with a group reaches posthog-node and segment-node with the same id and properties", async () => {
  const host = await listen();

  try {
    const response = await post(
      host.origin,
      "/api/events",
      trackedEvent({
        user: { id: "user_42" },
        groups: { crew: { id: "crew_1", traits: { size: 4 } } },
      }),
    );

    expect(response.status).toBe(200);

    const body: unknown = await response.json();

    expect(body).toMatchObject({
      status: {
        state: "settled",
        outcomes: {
          posthog: { status: "submitted" },
          segment: { status: "submitted" },
        },
      },
    });

    const [posthogCall] = host.providers.posthog.inbox.getSnapshot();
    const [segmentCall] = host.providers.segment.inbox.getSnapshot();

    expect(posthogCall).toMatchObject({
      eventName: "Checkout Started",
      user: "user_42",
      body: { cart: { id: "cart_1" }, value: 49.5, locale: "en-US" },
    });
    expect(segmentCall).toMatchObject({
      eventName: "Checkout Started",
      user: "user_42",
      body: { cart: { id: "cart_1" }, value: 49.5, locale: "en-US" },
    });
    expect(posthogCall?.id).toBe(segmentCall?.id);
  } finally {
    await host.dispose();
  }
});

test("an anonymous event with no visitor id is skipped by both destinations", async () => {
  const host = await listen();

  try {
    const response = await post(
      host.origin,
      "/api/events",
      trackedEvent({ user: null }),
    );

    expect(response.status).toBe(200);

    const body: unknown = await response.json();

    expect(body).toMatchObject({
      status: {
        state: "settled",
        outcomes: {
          posthog: { status: "skipped", reason: "unidentified" },
          segment: { status: "skipped", reason: "unidentified" },
        },
      },
    });
    expect(host.providers.posthog.inbox.getSnapshot()).toEqual([]);
    expect(host.providers.segment.inbox.getSnapshot()).toEqual([]);
  } finally {
    await host.dispose();
  }
});

test("a malformed body is rejected before it reaches a Trace", async () => {
  const host = await listen();

  try {
    const response = await post(host.origin, "/api/events", {
      ...trackedEvent({ user: { id: "user_42" } }),
      timestamp: "not-a-number",
    });

    expect(response.status).toBe(400);
    expect(host.providers.posthog.inbox.getSnapshot()).toEqual([]);
    expect(host.providers.segment.inbox.getSnapshot()).toEqual([]);
  } finally {
    await host.dispose();
  }
});

test("a request outside POST /api/events answers 404", async () => {
  const host = await listen();

  try {
    expect((await fetch(host.origin)).status).toBe(404);
    expect((await post(host.origin, "/api/other", {})).status).toBe(404);
  } finally {
    await host.dispose();
  }
});

test("an unstarted host has nothing to dispose", async () => {
  await expect(createEventsServer().dispose()).resolves.toBeUndefined();
});
