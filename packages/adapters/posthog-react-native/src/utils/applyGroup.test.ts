import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { applyGroup } from "src/utils/applyGroup";

test("a membership is PostHog's group, with its traits", async () => {
  const fake = fakePostHog();

  await applyGroup(fake.sdk, {
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { plan: "team" } },
  });

  expect(fake.calls).toStrictEqual([
    { method: "group", args: ["workspace", "w_1", { plan: "team" }] },
  ]);
  expect(fake.state.groups).toStrictEqual({ workspace: "w_1" });
});

test("a membership without traits is PostHog's group without properties, so the client sends no $groupidentify for one it already holds", async () => {
  const fake = fakePostHog();

  fake.state.groups = { workspace: "w_1" };

  await applyGroup(fake.sdk, {
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: {} },
  });

  expect(fake.calls).toStrictEqual([
    { method: "group", args: ["workspace", "w_1", undefined] },
  ]);
  expect(fake.queue).toStrictEqual([]);
});

test("leaving one group registers the memberships the client holds without that one, those it restored from its storage included", async () => {
  const fake = fakePostHog();

  fake.state.groups = { company: "acme", project: "p1" };

  await applyGroup(fake.sdk, {
    user: { id: "ada" },
    group: { type: "company", id: null, traits: {} },
  });

  expect(fake.calls).toStrictEqual([
    { method: "getPersistedProperty", args: ["props"] },
    { method: "register", args: [{ $groups: { project: "p1" } }] },
  ]);
  expect(fake.state.groups).toStrictEqual({ project: "p1" });
});

test("leaving a group while the client holds no super properties registers an empty $groups", async () => {
  const fake = fakePostHog();

  await applyGroup(fake.sdk, {
    user: null,
    group: { type: "company", id: null, traits: {} },
  });

  expect(fake.calls).toStrictEqual([
    { method: "getPersistedProperty", args: ["props"] },
    { method: "register", args: [{ $groups: {} }] },
  ]);
});

test("a leave settles once the client's register has, and rejects with it", async () => {
  const held = fakePostHog({ hold: ["register"] });
  const rejected = fakePostHog();
  const failure = new Error("Storage is full");

  let settled = false;

  const leaving = applyGroup(held.sdk, {
    user: null,
    group: { type: "company", id: null, traits: {} },
  }).then(() => {
    settled = true;
  });

  await Promise.resolve();

  expect(settled).toBe(false);

  held.held.forEach((release) => release());
  await leaving;

  expect(settled).toBe(true);

  rejected.state.failures.register = failure;

  await expect(
    applyGroup(rejected.sdk, {
      user: null,
      group: { type: "company", id: null, traits: {} },
    }),
  ).rejects.toBe(failure);
});
