import { expectTypeOf } from "vitest";
import { z } from "zod";

import type { GroupInput } from "src/types/GroupInput";
import type { GroupsOf } from "src/types/GroupsOf";
import type { StandardSchema } from "src/types/StandardSchema";
import type { TraceSchema } from "src/types/TraceSchema";
import type { TraitsInput } from "src/types/TraitsInput";
import type { TraitsOf } from "src/types/TraitsOf";

type Typed = {
  traits: {
    plan: StandardSchema<"free" | "pro">;
    seats: StandardSchema<unknown, number>;
  };
  groups: { workspace: { plan: StandardSchema<string> } };
};

export const zodSchema = {
  traits: { plan: z.enum(["free", "pro"]), seats: z.number() },
  groups: { workspace: { plan: z.string() } },
} satisfies TraceSchema;

expectTypeOf<TraitsOf<Typed>>().toEqualTypeOf<{
  plan: "free" | "pro";
  seats: number;
}>();
expectTypeOf<GroupsOf<Typed>>().toEqualTypeOf<{
  workspace: { plan: string };
}>();
expectTypeOf<TraitsOf<typeof zodSchema>>().toEqualTypeOf<{
  plan: "free" | "pro";
  seats: number;
}>();
expectTypeOf<GroupsOf<typeof zodSchema>>().toEqualTypeOf<{
  workspace: { plan: string };
}>();

expectTypeOf<TraitsOf<TraceSchema>>().toEqualTypeOf<Record<string, unknown>>();
expectTypeOf<GroupsOf<TraceSchema>>().toEqualTypeOf<
  Record<string, Record<string, unknown>>
>();
expectTypeOf<TraitsOf<Pick<Typed, "groups">>>().toEqualTypeOf<
  Record<string, unknown>
>();
expectTypeOf<GroupsOf<Pick<Typed, "traits">>>().toEqualTypeOf<
  Record<string, Record<string, unknown>>
>();

export const traits: TraitsInput<Typed> = { plan: "pro", seats: null };
export const untypedTraits: TraitsInput<TraceSchema> = {
  anything: { goes: true },
  removed: null,
};

// @ts-expect-error A trait the schema does not declare is refused.
export const undeclaredTrait: TraitsInput<Typed> = { role: "admin" };

export const wrongTrait: TraitsInput<Typed> = {
  // @ts-expect-error A trait's value is typed by its schema.
  plan: "enterprise",
};

export const group: GroupInput<Typed, "workspace"> = {
  id: "w_1",
  traits: { plan: null },
};
export const untypedGroup: GroupInput<TraceSchema, "team"> = {
  id: "t_1",
  traits: { size: 3 },
};

export const wrongGroupTrait: GroupInput<Typed, "workspace"> = {
  id: "w_1",
  // @ts-expect-error A group trait's value is typed by its schema.
  traits: { plan: 3 },
};
