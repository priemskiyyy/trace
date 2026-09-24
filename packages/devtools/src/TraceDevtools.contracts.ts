import { Trace, event } from "@priemskiyyy/trace";
import type { Destinations, EventDefinition } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";

import { TraceDevtools } from "src/TraceDevtools";
import type { TraceDevtoolsProps } from "src/types/TraceDevtoolsProps";

const typed = new Trace({
  events: {
    "App Opened": event(),
    "Checkout Started": event<{ plan: string }>(),
  },
  destinations: { product: createMockAdapter().adapter },
  consent: { product: ["analytics"] },
});

const untyped = new Trace<
  Record<string, EventDefinition<never, unknown>>,
  Destinations
>({
  events: { "App Opened": event() },
  destinations: { product: createMockAdapter().adapter },
});

export const forTypedTrace = new TraceDevtools({ trace: typed });

export const forUntypedTrace = new TraceDevtools({ trace: untyped });

export const withoutEvents = new TraceDevtools({
  // @ts-expect-error The inspector reads the events stream as well as the diagnostics.
  trace: { diagnostics: typed.diagnostics },
});

export const withoutDiagnostics = new TraceDevtools({
  // @ts-expect-error The inspector reads the diagnostics as well as the events stream.
  trace: { events: typed.events },
});

export const wrapperProps: TraceDevtoolsProps = {
  initialIsOpen: true,
  maxEvents: 500,
  // @ts-expect-error A wrapper reads the Trace from its binding's provider.
  trace: typed,
};
