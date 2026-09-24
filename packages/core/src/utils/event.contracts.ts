import { expectTypeOf } from "vitest";
import { z } from "zod";

import type { EventDefinition } from "src/types/EventDefinition";
import type { EventInput } from "src/types/EventInput";
import type { EventProperties } from "src/types/EventProperties";
import type { TraceScope } from "src/types/TraceScope";
import type { TrackArguments } from "src/types/TrackArguments";
import type { TrackedEventOf } from "src/types/TrackedEventOf";
import type { TrackOptions } from "src/types/TrackOptions";
import { event } from "src/utils/event";

declare const noteAdded: EventDefinition<{ note: string } | undefined>;

export const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
  "Checkout Started": event(
    z.object({
      cart: z.object({ id: z.string() }),
      value: z.number().default(0),
    }),
  ),
  "Note Added": noteAdded,
};

type Events = typeof events;

export const registry: Record<string, EventDefinition<never, unknown>> = events;

expectTypeOf<EventInput<Events["App Opened"]>>().toEqualTypeOf<undefined>();
expectTypeOf<EventProperties<Events["App Opened"]>>().toEqualTypeOf<
  Record<string, never>
>();
expectTypeOf<EventInput<Events["Search Performed"]>>().toEqualTypeOf<{
  query: string;
}>();
expectTypeOf<EventProperties<Events["Search Performed"]>>().toEqualTypeOf<{
  query: string;
}>();
expectTypeOf<EventInput<Events["Checkout Started"]>>().toEqualTypeOf<{
  cart: { id: string };
  value?: number | undefined;
}>();
expectTypeOf<EventProperties<Events["Checkout Started"]>>().toEqualTypeOf<{
  cart: { id: string };
  value: number;
}>();

expectTypeOf<TrackArguments<Events["App Opened"], "product">>().toEqualTypeOf<
  [properties?: undefined, options?: TrackOptions<"product">]
>();
expectTypeOf<
  TrackArguments<Events["Search Performed"], "product">
>().toEqualTypeOf<
  [properties: { query: string }, options?: TrackOptions<"product">]
>();
expectTypeOf<TrackArguments<Events["Note Added"], "product">>().toEqualTypeOf<
  [properties?: { note: string } | undefined, options?: TrackOptions<"product">]
>();

expectTypeOf<TrackedEventOf<Events>["name"]>().toEqualTypeOf<
  "App Opened" | "Search Performed" | "Checkout Started" | "Note Added"
>();
expectTypeOf<
  Extract<TrackedEventOf<Events>, { name: "Checkout Started" }>["properties"]
>().toEqualTypeOf<{ cart: { id: string }; value: number }>();

declare const scope: TraceScope<Events, "product" | "backend">;

scope.track("App Opened");
scope.track("App Opened", undefined, { to: ["product"] });
scope.track("Search Performed", { query: "shoes" });
scope.track("Checkout Started", { cart: { id: "c_1" } });
scope.track("Note Added");
scope.track("Note Added", { note: "gift" }, { to: ["backend"] });

// @ts-expect-error Checkout Started requires its properties.
scope.track("Checkout Started");

// @ts-expect-error App Opened takes no properties.
scope.track("App Opened", { cart: "c_1" });

// @ts-expect-error Search Performed declares its properties exactly.
scope.track("Search Performed", { query: "shoes", page: 2 });

// @ts-expect-error `to` names only the configured destinations.
scope.track("App Opened", undefined, { to: ["warehouse"] });

// @ts-expect-error An event the registry does not declare cannot be tracked.
scope.track("Wishlist Shared");

// @ts-expect-error event() takes a Standard Schema, never an options object.
event({ name: "App Opened" });
