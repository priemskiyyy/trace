import { expect, test } from "vitest";

import { identityPlugin } from "src/identityPlugin";

test("the plugin is an enrichment plugin with a name of its own, so Amplitude runs it after its context plugin and adds it once", () => {
  const plugin = identityPlugin();

  expect({ name: plugin.name, type: plugin.type }).toStrictEqual({
    name: "@priemskiyyy/trace-amplitude",
    type: "enrichment",
  });
});

test("the plugin is set up only once Amplitude has added it", async () => {
  const plugin = identityPlugin();

  expect(plugin.isSetUp()).toBe(false);

  await plugin.setup();

  expect(plugin.isSetUp()).toBe(true);
});

test("Amplitude's teardown, which remove() and a later init() call, takes the plugin out of set-up until it is added again", async () => {
  const plugin = identityPlugin();
  const states: boolean[] = [];

  await plugin.setup();
  await plugin.teardown();
  states.push(plugin.isSetUp());
  await plugin.setup();
  states.push(plugin.isSetUp());

  expect(states).toStrictEqual([false, true]);
});

test("a call carrying Trace's pin in its extra leaves with the user and device it was made for, whatever Amplitude filled in", async () => {
  const plugin = identityPlugin();

  expect(
    await plugin.execute({
      event_type: "Note Added",
      insert_id: "insert-1",
      user_id: "bob",
      device_id: "device-2",
      time: 1_767_225_600_000,
      extra: {
        "@priemskiyyy/trace-amplitude": {
          user_id: "ada",
          device_id: "device-1",
        },
      },
    }),
  ).toStrictEqual({
    event_type: "Note Added",
    insert_id: "insert-1",
    user_id: "ada",
    device_id: "device-1",
    time: 1_767_225_600_000,
    extra: {
      "@priemskiyyy/trace-amplitude": { user_id: "ada", device_id: "device-1" },
    },
  });
});

test("an anonymous call loses the user Amplitude filled in and keeps the device it was made on", async () => {
  const plugin = identityPlugin();

  expect(
    await plugin.execute({
      event_type: "Note Added",
      user_id: "bob",
      device_id: "device-2",
      extra: { "@priemskiyyy/trace-amplitude": { device_id: "device-1" } },
    }),
  ).toStrictEqual({
    event_type: "Note Added",
    device_id: "device-1",
    extra: { "@priemskiyyy/trace-amplitude": { device_id: "device-1" } },
  });
});

test("an event without Trace's pin passes through untouched: the application's own, one with an extra of its own, and one with none", async () => {
  const plugin = identityPlugin();

  const own = {
    event_type: "Own",
    insert_id: "insert-2",
    user_id: "bob",
    device_id: "device-2",
  };

  const tagged = { event_type: "Tagged", user_id: "bob", extra: {} };
  const bare = { event_type: "Bare", user_id: "bob" };

  expect(await plugin.execute(own)).toBe(own);
  expect(await plugin.execute(tagged)).toBe(tagged);
  expect(await plugin.execute(bare)).toBe(bare);
  expect([own, tagged, bare]).toStrictEqual([
    {
      event_type: "Own",
      insert_id: "insert-2",
      user_id: "bob",
      device_id: "device-2",
    },
    { event_type: "Tagged", user_id: "bob", extra: {} },
    { event_type: "Bare", user_id: "bob" },
  ]);
});

test("the plugin keeps nothing between calls: a call is filed by its own pin every time Amplitude runs it, a teardown and a new setup included", async () => {
  const plugin = identityPlugin();

  const held = {
    event_type: "Held",
    user_id: "bob",
    extra: { "@priemskiyyy/trace-amplitude": { device_id: "device-1" } },
  };

  const first = await plugin.execute({ ...held });

  await plugin.teardown();
  await plugin.setup();

  const second = await plugin.execute({ ...held });

  expect([first, second]).toStrictEqual([
    {
      event_type: "Held",
      device_id: "device-1",
      extra: { "@priemskiyyy/trace-amplitude": { device_id: "device-1" } },
    },
    {
      event_type: "Held",
      device_id: "device-1",
      extra: { "@priemskiyyy/trace-amplitude": { device_id: "device-1" } },
    },
  ]);
});
