import { TraceError } from "@priemskiyyy/trace";
import { expect, test } from "vitest";

import { fakePostHog } from "src/fakePostHog.fixture";
import { applyGroup } from "src/utils/applyGroup";

const getThrown = (call: () => unknown) => {
  try {
    call();
  } catch (error) {
    return error;
  }

  return null;
};

test("a membership is PostHog's group, with its traits when it has any", () => {
  const fake = fakePostHog();

  applyGroup(fake.sdk, {
    user: { id: "ada" },
    group: { type: "workspace", id: "w_1", traits: { plan: "team" } },
  });
  applyGroup(fake.sdk, {
    user: { id: "ada" },
    group: { type: "team", id: "t_1", traits: {} },
  });

  expect(fake.calls.group).toStrictEqual([
    { type: "workspace", key: "w_1", properties: { plan: "team" } },
    { type: "team", key: "t_1", properties: undefined },
  ]);
  expect(fake.state.groups).toStrictEqual({ workspace: "w_1", team: "t_1" });
  expect(fake.state.groupProperties).toStrictEqual({
    "workspace:w_1": { plan: "team" },
  });
});

test("leaving one group registers the memberships posthog-js holds without that one, those it restored from its storage included", () => {
  const fake = fakePostHog();

  fake.state.groups = { company: "acme", project: "p1" };

  applyGroup(fake.sdk, {
    user: { id: "ada" },
    group: { type: "company", id: null, traits: {} },
  });

  expect(fake.calls.register).toStrictEqual([{ $groups: { project: "p1" } }]);
  expect(fake.state.groups).toStrictEqual({ project: "p1" });
});

test('under person_profiles "never", a group change is reported unsupported and nothing is sent', () => {
  const fake = fakePostHog({ config: { person_profiles: "never" } });

  const unsupported = new TraceError({
    code: "UNSUPPORTED",
    message: `PostHog's person_profiles "never" keeps no person, so it ignores identify, person properties and group properties.`,
  });

  expect(
    getThrown(() =>
      applyGroup(fake.sdk, {
        user: null,
        group: { type: "workspace", id: "w_1", traits: {} },
      }),
    ),
  ).toStrictEqual(unsupported);
  expect(
    getThrown(() =>
      applyGroup(fake.sdk, {
        user: null,
        group: { type: "workspace", id: null, traits: {} },
      }),
    ),
  ).toStrictEqual(unsupported);
  expect(fake.calls.group).toStrictEqual([]);
  expect(fake.calls.register).toStrictEqual([]);
});

test("a group trait holding a string posthog-js would cut is left out whole, the membership and the rest are sent, and then the change is reported unsupported", () => {
  const fake = fakePostHog({ config: { properties_string_max_length: 8 } });

  const thrown = getThrown(() =>
    applyGroup(fake.sdk, {
      user: null,
      group: {
        type: "team",
        id: "w_1",
        traits: {
          plan: "team",
          motto: "abcdefghi",
          office: { city: "abcdefghi", floor: 3 },
        },
      },
    }),
  );

  expect(fake.calls.group).toStrictEqual([
    { type: "team", key: "w_1", properties: { plan: "team" } },
  ]);
  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut these values past properties_string_max_length, so they were left out: group.team.motto, group.team.office.",
    }),
  );
});

test("a group whose every trait posthog-js would cut still joins, without properties, and is reported unsupported", () => {
  const fake = fakePostHog({ config: { properties_string_max_length: 8 } });

  const thrown = getThrown(() =>
    applyGroup(fake.sdk, {
      user: null,
      group: { type: "team", id: "w_1", traits: { motto: "abcdefghi" } },
    }),
  );

  expect(fake.calls.group).toStrictEqual([
    { type: "team", key: "w_1", properties: undefined },
  ]);
  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut these values past properties_string_max_length, so they were left out: group.team.motto.",
    }),
  );
});

test("a group type posthog-js would cut is refused before any call, since it can never have been registered, while a type and key of the limit's length join", () => {
  const fake = fakePostHog({ config: { properties_string_max_length: 8 } });

  const thrown = getThrown(() =>
    applyGroup(fake.sdk, {
      user: null,
      group: { type: "workspace", id: "w_1", traits: { plan: "team" } },
    }),
  );

  applyGroup(fake.sdk, {
    user: null,
    group: { type: "projects", id: "abcdefgh", traits: {} },
  });

  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut this group type past properties_string_max_length, so the membership was left out.",
    }),
  );
  expect(fake.calls.register).toStrictEqual([]);
  expect(fake.calls.group).toStrictEqual([
    { type: "projects", key: "abcdefgh", properties: undefined },
  ]);
});

test("a group key posthog-js would cut leaves the group of that type before the change is reported unsupported, so the next event carries no membership the user left", () => {
  const fake = fakePostHog({ config: { properties_string_max_length: 8 } });

  applyGroup(fake.sdk, {
    user: null,
    group: { type: "company", id: "c_1", traits: {} },
  });
  applyGroup(fake.sdk, {
    user: null,
    group: { type: "project", id: "p_1", traits: {} },
  });

  const thrown = getThrown(() =>
    applyGroup(fake.sdk, {
      user: null,
      group: { type: "company", id: "abcdefghi", traits: { plan: "team" } },
    }),
  );

  fake.sdk.capture("Note Added");

  expect(fake.calls.group).toStrictEqual([
    { type: "company", key: "c_1", properties: undefined },
    { type: "project", key: "p_1", properties: undefined },
  ]);
  expect(fake.calls.register).toStrictEqual([{ $groups: { project: "p_1" } }]);
  expect(
    fake.captured.map(({ properties }) => properties.$groups),
  ).toStrictEqual([{ project: "p_1" }]);
  expect(thrown).toStrictEqual(
    new TraceError({
      code: "UNSUPPORTED",
      message:
        "posthog-js would cut this group key past properties_string_max_length, so the membership was left out and the user left any group of this type.",
    }),
  );
});
