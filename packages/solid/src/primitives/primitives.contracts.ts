import { Trace, event } from "@priemskiyyy/trace";
import type {
  ConsentDecision,
  Destinations,
  DestinationStatus,
  EventDefinition,
  TraceSchema,
  TraceStatus,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type { Accessor } from "solid-js";
import { expectTypeOf } from "vitest";

import type { TraceProviderProps } from "src/context/TraceProvider";
import { useConsent } from "src/primitives/useConsent";
import { useDestinationStatus } from "src/primitives/useDestinationStatus";
import { useTrace } from "src/primitives/useTrace";
import { useTraceStatus } from "src/primitives/useTraceStatus";
import type {
  RegisteredDestinationName,
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "src/types/Register";

const untyped = new Trace<
  RegisteredEvents,
  Destinations,
  TraceSchema,
  RegisteredPurpose
>({
  events: { "App Opened": event() },
  destinations: { product: createMockAdapter().adapter },
  consent: { product: ["analytics"] },
});

const typed = new Trace({
  events: {
    "App Opened": event(),
    "Search Performed": event<{ query: string }>(),
  },
  destinations: { product: createMockAdapter().adapter },
  consent: { product: ["analytics"] },
});

expectTypeOf(untyped).toExtend<TraceProviderProps["trace"]>();

// @ts-expect-error Unregistered, the provider refuses a Trace typed by its own events.
export const unregistered: TraceProviderProps["trace"] = typed;

// @ts-expect-error The provider publishes a Trace.
export const withoutTrace: TraceProviderProps = { children: null };

expectTypeOf<RegisteredEvents>().toEqualTypeOf<
  Record<string, EventDefinition<never, unknown>>
>();
expectTypeOf<RegisteredDestinationName>().toEqualTypeOf<string>();
expectTypeOf<RegisteredPurpose>().toEqualTypeOf<string>();
expectTypeOf<RegisteredTrace>().toEqualTypeOf<
  Trace<
    Record<string, EventDefinition<never, unknown>>,
    Destinations,
    TraceSchema,
    string
  >
>();

export const useTypeContracts = () => {
  expectTypeOf(useTrace()).toEqualTypeOf<Accessor<RegisteredTrace>>();
  expectTypeOf(
    useTrace()().destination("anything").native,
  ).toEqualTypeOf<unknown>();
  expectTypeOf(useTraceStatus()).toEqualTypeOf<Accessor<TraceStatus>>();
  expectTypeOf(useDestinationStatus("anything")).toEqualTypeOf<
    Accessor<DestinationStatus>
  >();
  expectTypeOf(useConsent()).toEqualTypeOf<
    Accessor<Record<string, ConsentDecision>>
  >();
  expectTypeOf(useTraceStatus)
    .parameter(0)
    .toEqualTypeOf<
      ((status: TraceStatus) => void | Promise<unknown>) | undefined
    >();
  expectTypeOf(useDestinationStatus)
    .parameter(1)
    .toEqualTypeOf<
      ((status: DestinationStatus) => void | Promise<unknown>) | undefined
    >();
  expectTypeOf(useConsent)
    .parameter(0)
    .toEqualTypeOf<
      | ((
          decisions: Record<string, ConsentDecision>,
        ) => void | Promise<unknown>)
      | undefined
    >();

  useDestinationStatus(() => "anything");
  useTrace()().track("Anything");

  // @ts-expect-error Without the Register, an event carries no properties.
  useTrace()().track("Search Performed", { query: "shoes" });

  // @ts-expect-error A destination is named by a string.
  useDestinationStatus(7);
};
