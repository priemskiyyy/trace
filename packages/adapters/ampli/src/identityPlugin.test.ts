import { expect, test } from "vitest";

import { identityPlugin } from "src/identityPlugin";

test("the plugin is an enrichment plugin with a name of its own, so Amplitude runs it after its context plugin and adds it once", () => {
  const plugin = identityPlugin();

  expect({ name: plugin.name, type: plugin.type }).toStrictEqual({
    name: "@priemskiyyy/trace-ampli",
    type: "enrichment",
  });
});

test("the plugin is set up only once Amplitude has added it", async () => {
  const plugin = identityPlugin();

  expect(plugin.isSetUp()).toBe(false);

  await plugin.setup();

  expect(plugin.isSetUp()).toBe(true);
});

test("once Amplitude takes the plugin out it is at once no longer set up, and adding it again sets it up again", async () => {
  const plugin = identityPlugin();

  await plugin.setup();

  const tornDown = plugin.teardown();

  expect(plugin.isSetUp()).toBe(false);
  await expect(tornDown).resolves.toBeUndefined();

  await plugin.setup();

  expect(plugin.isSetUp()).toBe(true);
});

test("a call Trace pinned leaves with the user and device it was made for, whatever Amplitude filled in", async () => {
  const plugin = identityPlugin();

  expect(
    await plugin.execute({
      event_type: "Event No Properties",
      insert_id: "insert-1",
      user_id: "bob_2",
      device_id: "device-2",
      time: 1_767_225_600_000,
      extra: {
        "@priemskiyyy/trace-ampli": { user_id: "ada_1", device_id: "device-1" },
      },
    }),
  ).toStrictEqual({
    event_type: "Event No Properties",
    insert_id: "insert-1",
    user_id: "ada_1",
    device_id: "device-1",
    time: 1_767_225_600_000,
    extra: {
      "@priemskiyyy/trace-ampli": { user_id: "ada_1", device_id: "device-1" },
    },
  });
});

test("an anonymous call Trace pinned loses the user Amplitude filled in and keeps the device it was made on", async () => {
  const plugin = identityPlugin();

  expect(
    await plugin.execute({
      event_type: "Event No Properties",
      user_id: "bob_2",
      device_id: "device-2",
      extra: { "@priemskiyyy/trace-ampli": { device_id: "device-1" } },
    }),
  ).toStrictEqual({
    event_type: "Event No Properties",
    device_id: "device-1",
    extra: { "@priemskiyyy/trace-ampli": { device_id: "device-1" } },
  });
});

test("a call that still carries its pin keeps it after Amplitude took the plugin out, so a call Amplitude held meanwhile is filed as it was made", async () => {
  const plugin = identityPlugin();

  await plugin.setup();
  await plugin.teardown();

  expect(
    await plugin.execute({
      event_type: "Held",
      user_id: "bob_2",
      device_id: "device-2",
      extra: { "@priemskiyyy/trace-ampli": { device_id: "device-1" } },
    }),
  ).toStrictEqual({
    event_type: "Held",
    device_id: "device-1",
    extra: { "@priemskiyyy/trace-ampli": { device_id: "device-1" } },
  });
});

test("an event Trace did not pin passes through untouched: the application's own, one with an extra of its own, and one without an insert id", async () => {
  const plugin = identityPlugin();

  const own = {
    event_type: "Own",
    insert_id: "insert-2",
    user_id: "bob_2",
    device_id: "device-2",
  };

  const grouped = {
    event_type: "Grouped",
    user_id: "bob_2",
    extra: { groups: { team: "core" } },
  };

  const bare = { event_type: "Bare", user_id: "bob_2" };

  expect(await plugin.execute(own)).toBe(own);
  expect(await plugin.execute(grouped)).toBe(grouped);
  expect(await plugin.execute(bare)).toBe(bare);
  expect([own, grouped, bare]).toStrictEqual([
    {
      event_type: "Own",
      insert_id: "insert-2",
      user_id: "bob_2",
      device_id: "device-2",
    },
    {
      event_type: "Grouped",
      user_id: "bob_2",
      extra: { groups: { team: "core" } },
    },
    { event_type: "Bare", user_id: "bob_2" },
  ]);
});
