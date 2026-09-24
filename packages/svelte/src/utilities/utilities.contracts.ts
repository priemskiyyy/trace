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
import { expectTypeOf } from "vitest";
import type { ReadableValue } from "../types/ReadableValue.js";
import type {
  RegisteredDestinationName,
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "../types/Register.js";
import type { TraceProviderProps } from "../types/TraceProviderProps.js";
import { useConsent } from "./useConsent.js";
import { useDestinationStatus } from "./useDestinationStatus.js";
import { useTrace } from "./useTrace.js";
import { useTraceStatus } from "./useTraceStatus.js";

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
export const withoutTrace: TraceProviderProps = {};

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
  expectTypeOf(useTrace()).toEqualTypeOf<ReadableValue<RegisteredTrace>>();
  expectTypeOf(
    useTrace().current.destination("anything").native,
  ).toEqualTypeOf<unknown>();
  expectTypeOf(useTraceStatus()).toEqualTypeOf<ReadableValue<TraceStatus>>();
  expectTypeOf(useDestinationStatus("anything")).toEqualTypeOf<
    ReadableValue<DestinationStatus>
  >();
  expectTypeOf(useConsent()).toEqualTypeOf<
    ReadableValue<Record<string, ConsentDecision>>
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
  useTrace().current.track("Anything");

  const status = useTraceStatus();

  // @ts-expect-error A status is read, never written.
  status.current = { state: "started" };

  // @ts-expect-error Without the Register, an event carries no properties.
  useTrace().current.track("Search Performed", { query: "shoes" });

  // @ts-expect-error A destination is named by a string.
  useDestinationStatus(7);
};
