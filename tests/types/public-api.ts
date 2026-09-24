import { expectTypeOf } from "vitest";
import { event, isSensitiveKey, Trace, TraceError } from "@priemskiyyy/trace";
import type {
  AnalyticsAdapter,
  AnalyticsSession,
  ConsentDecision,
  DestinationFlushResult,
  DestinationHandle,
  DestinationName,
  DestinationOutcome,
  Destinations,
  DestinationStatus,
  DropReason,
  EventDefinition,
  EventName,
  EventProperties,
  FlushContext,
  FlushResult,
  GroupsOf,
  GroupUpdate,
  IdentifyUpdate,
  MappingLoss,
  NativeOf,
  ObservableValue,
  ParseResult,
  Receipt,
  ReceiptStatus,
  StandardSchema,
  TraceConsent,
  TraceDiagnosticEvent,
  TraceDiagnostics,
  TraceErrorCode,
  TraceEvents,
  TraceFlushResult,
  TraceLimits,
  TraceOptions,
  TracePrivacy,
  TraceSchema,
  TraceScope,
  TraceSnapshot,
  TraceStatus,
  TrackContext,
  TrackedEvent,
  TrackedEventOf,
  TrackEvidence,
  TrackOptions,
  TrackResult,
  TraitsOf,
  TraitsUpdate,
} from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type {
  MockAdapterOptions,
  MockFlush,
  MockIdentityCall,
  MockSession,
  MockTrack,
} from "@priemskiyyy/trace/mock";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import type { AnalyticsConformanceOptions } from "@priemskiyyy/trace/testing";
// @ts-expect-error The default redaction is isSensitiveKey, composed into a redact predicate.
import { DEFAULT_REDACT } from "@priemskiyyy/trace";
// @ts-expect-error An adapter is a plain { name, open }, so there is no adapter kit.
import { createAnalyticsAdapter } from "@priemskiyyy/trace";

type Checkout = { cart: { id: string }; value?: number };

type Plan = "free" | "pro";

type ProductOnly = { product: typeof product };

type SchemaResult =
  | { value: number; issues?: undefined }
  | {
      issues: Iterable<{
        message: string;
        path?: Iterable<PropertyKey | { key: PropertyKey }> | undefined;
      }>;
    };

declare const checkout: StandardSchema<Checkout, Required<Checkout>>;
declare const plan: StandardSchema<Plan>;
declare const tier: StandardSchema<string>;
declare const product: AnalyticsAdapter<{ sdkVersion: string }>;
declare const session: AnalyticsSession;
declare const tracked: TrackedEvent;
declare const scope: TraceScope<Events, Destination>;

const events = {
  "App Opened": event(),
  "Search Performed": event<{ query: string }>(),
  "Checkout Started": event(checkout),
};

type Events = typeof events;

type Destination = "product" | "research";

const trace = new Trace({
  events,
  destinations: { product, research: createMockAdapter().adapter },
  schema: { traits: { plan }, groups: { workspace: { tier } } },
  consent: { product: ["analytics"], research: ["analytics", "advertising"] },
});

expectTypeOf(event()).toEqualTypeOf<
  EventDefinition<undefined, Record<string, never>>
>();
expectTypeOf(event<{ query: string }>()).toEqualTypeOf<
  EventDefinition<{ query: string }, { query: string }>
>();
expectTypeOf(event(checkout)).toEqualTypeOf<
  EventDefinition<Checkout, Required<Checkout>>
>();
expectTypeOf<EventName<Events>>().toEqualTypeOf<
  "App Opened" | "Search Performed" | "Checkout Started"
>();
expectTypeOf<EventProperties<Events["Checkout Started"]>>().toEqualTypeOf<
  Required<Checkout>
>();
expectTypeOf<TrackedEventOf<Events>>().toEqualTypeOf<
  | TrackedEvent<"App Opened", Record<string, never>>
  | TrackedEvent<"Search Performed", { query: string }>
  | TrackedEvent<"Checkout Started", Required<Checkout>>
>();
expectTypeOf(isSensitiveKey).toEqualTypeOf<(key: string) => boolean>();
expectTypeOf<TraceError>().toExtend<Error>();
expectTypeOf<TraceError["code"]>().toEqualTypeOf<TraceErrorCode>();
expectTypeOf<TraceErrorCode>().toEqualTypeOf<
  | "INVALID_CONFIGURATION"
  | "NOT_INITIALIZED"
  | "UNSUPPORTED"
  | "INVALID_ANSWER"
  | "DELIVERY_FAILED"
>();
expectTypeOf(TraceError).constructorParameters.toEqualTypeOf<
  [{ code: TraceErrorCode; message: string; cause?: unknown }]
>();

expectTypeOf<keyof typeof trace>().toEqualTypeOf<
  | "status"
  | "diagnostics"
  | "events"
  | "consent"
  | "start"
  | "track"
  | "user"
  | "traits"
  | "group"
  | "context"
  | "scope"
  | "destination"
  | "flush"
  | "dispose"
>();
expectTypeOf(trace.status).toEqualTypeOf<ObservableValue<TraceStatus>>();
expectTypeOf(trace.diagnostics).toEqualTypeOf<TraceDiagnostics>();
expectTypeOf(trace.events).toEqualTypeOf<TraceEvents<Events>>();
expectTypeOf(trace.consent).toEqualTypeOf<
  TraceConsent<"analytics" | "advertising">
>();
expectTypeOf(trace.start).toEqualTypeOf<() => void>();
expectTypeOf(trace.dispose).toEqualTypeOf<() => void>();
expectTypeOf(trace.flush).toEqualTypeOf<
  (options?: { timeout?: number }) => Promise<TraceFlushResult<Destination>>
>();
expectTypeOf(trace.scope({ context: { flow: "checkout" } })).toEqualTypeOf<
  TraceScope<Events, Destination>
>();
expectTypeOf(trace.destination("product")).toEqualTypeOf<
  DestinationHandle<{ sdkVersion: string }>
>();
expectTypeOf(trace.destination("research")).toEqualTypeOf<
  DestinationHandle<MockSession>
>();

expectTypeOf(trace.track<"App Opened">).parameters.toEqualTypeOf<
  [
    name: "App Opened",
    properties?: undefined,
    options?: TrackOptions<Destination>,
  ]
>();
expectTypeOf(trace.track<"Search Performed">).parameters.toEqualTypeOf<
  [
    name: "Search Performed",
    properties: { query: string },
    options?: TrackOptions<Destination>,
  ]
>();
expectTypeOf(trace.track<"Checkout Started">).parameters.toEqualTypeOf<
  [
    name: "Checkout Started",
    properties: Checkout,
    options?: TrackOptions<Destination>,
  ]
>();
expectTypeOf(trace.track("App Opened")).toEqualTypeOf<Receipt<Destination>>();
expectTypeOf<TrackOptions<Destination>>().toEqualTypeOf<{
  to?: Destination[];
  context?: Record<string, unknown>;
  timestamp?: number;
}>();

expectTypeOf(trace.user).toEqualTypeOf<
  (user: { id: string; traits?: { plan?: Plan | null } } | null) => void
>();
expectTypeOf(trace.traits).toEqualTypeOf<
  (traits: { plan?: Plan | null }) => void
>();
expectTypeOf(trace.group<"workspace">).toEqualTypeOf<
  (
    type: "workspace",
    group: { id: string; traits?: { tier?: string | null } } | null,
  ) => void
>();
expectTypeOf(trace.context).toEqualTypeOf<
  (context: Record<string, unknown>) => void
>();

expectTypeOf<TraceStatus>().toEqualTypeOf<
  { state: "idle" } | { state: "started" } | { state: "disposed" }
>();
expectTypeOf<DestinationStatus>().toEqualTypeOf<
  | { state: "idle" }
  | { state: "ready" }
  | { state: "failed"; error: unknown }
  | { state: "disposed" }
>();
expectTypeOf<ConsentDecision>().toEqualTypeOf<
  "unknown" | "granted" | "denied"
>();
expectTypeOf<DropReason>().toEqualTypeOf<
  | "invalid"
  | "sanitizer-failed"
  | "consent"
  | "not-routed"
  | "reentrant"
  | "disposed"
>();
expectTypeOf<TrackEvidence>().toEqualTypeOf<
  "sdk-call-returned" | "sdk-callback-completed" | "backend-acknowledged"
>();
expectTypeOf<MappingLoss>().toEqualTypeOf<{
  path: string;
  reason:
    | "redacted"
    | "truncated"
    | "invalid"
    | "unsupported"
    | "omitted"
    | "coerced";
}>();
expectTypeOf<DestinationOutcome>().toEqualTypeOf<
  | {
      status: "submitted";
      evidence: TrackEvidence;
      event: { id: string } | null;
      losses: MappingLoss[];
    }
  | { status: "dropped"; reason: "provider-filtered"; losses: MappingLoss[] }
  | {
      status: "dropped";
      reason:
        | "consent"
        | "buffer-overflow"
        | "buffer-expired"
        | "identity-changed"
        | "disposed";
    }
  | {
      status: "skipped";
      reason:
        | "start-failed"
        | "identity-failed"
        | "auth-subject-mismatch"
        | "unidentified"
        | "unsupported";
    }
  | { status: "failed"; error: unknown }
  | { status: "indeterminate"; reason: "timeout" | "disposed" | "ambiguous" }
>();
expectTypeOf<ReceiptStatus<Destination>>().toEqualTypeOf<
  | {
      state: "dropped";
      reason: "invalid";
      issues: { path: string; message: string }[];
    }
  | { state: "dropped"; reason: Exclude<DropReason, "invalid"> }
  | {
      state: "pending";
      outcomes: Partial<Record<Destination, DestinationOutcome | null>>;
    }
  | {
      state: "settled";
      outcomes: Partial<Record<Destination, DestinationOutcome>>;
    }
>();
expectTypeOf<Receipt<Destination>>().toEqualTypeOf<{
  id: string;
  status: ObservableValue<ReceiptStatus<Destination>>;
  settled: Promise<ReceiptStatus<Destination>>;
}>();
expectTypeOf<TrackResult>().toEqualTypeOf<
  | {
      status: "submitted";
      evidence: TrackEvidence;
      event?: { id: string } | null;
      losses?: MappingLoss[];
    }
  | { status: "dropped"; reason: "provider-filtered"; losses?: MappingLoss[] }
  | {
      status: "skipped";
      reason: "auth-subject-mismatch" | "unidentified" | "unsupported";
    }
  | { status: "failed"; error: unknown }
  | { status: "indeterminate"; reason: "ambiguous" }
>();
expectTypeOf<FlushResult>().toEqualTypeOf<
  | { status: "flushed" }
  | { status: "timeout" }
  | { status: "failed"; error: unknown }
>();
expectTypeOf<DestinationFlushResult>().toEqualTypeOf<
  FlushResult | { status: "unsupported" } | { status: "not-ready" }
>();
expectTypeOf<TraceFlushResult<Destination>>().toEqualTypeOf<{
  drained: boolean;
  destinations: Partial<Record<Destination, DestinationFlushResult>>;
}>();
expectTypeOf<DestinationHandle<{ sdkVersion: string }>>().toEqualTypeOf<{
  status: ObservableValue<DestinationStatus>;
  native: { sdkVersion: string } | null;
}>();
expectTypeOf<ObservableValue<number>>().toEqualTypeOf<{
  get: () => number;
  subscribe: (listener: () => void) => () => void;
}>();
expectTypeOf<TraceConsent<"analytics">>().toEqualTypeOf<
  ObservableValue<Record<"analytics", ConsentDecision>> & {
    set: (decisions: Partial<Record<"analytics", ConsentDecision>>) => void;
  }
>();
expectTypeOf<TraceEvents<Events>>().toEqualTypeOf<{
  subscribe: (listener: (event: TrackedEventOf<Events>) => void) => () => void;
}>();
expectTypeOf<TraceDiagnostics>().toEqualTypeOf<
  ObservableValue<TraceSnapshot> & {
    events: {
      subscribe: (
        listener: (event: TraceDiagnosticEvent) => void,
      ) => () => void;
    };
  }
>();
expectTypeOf<TraceSnapshot>().toEqualTypeOf<{
  status: TraceStatus;
  identity: { generation: number; user: { id: string } | null };
  consent: Record<string, ConsentDecision>;
  pendingReceipts: number;
  destinations: {
    name: string;
    adapter: { name: string };
    status: DestinationStatus;
    buffered: number;
    inFlight: number;
  }[];
}>();
expectTypeOf<TraceDiagnosticEvent>().toEqualTypeOf<{
  source: "runtime" | "identity" | "consent" | "event" | "destination";
  type: string;
  destination: { name: string } | null;
  event: { id: string } | null;
  timestamp: number;
  context: unknown;
}>();
expectTypeOf<TrackedEvent>().toEqualTypeOf<{
  id: string;
  name: string;
  properties: Record<string, unknown>;
  context: Record<string, unknown>;
  identity: {
    generation: number;
    user: { id: string } | null;
    traits: Record<string, unknown>;
    groups: Record<string, { id: string; traits: Record<string, unknown> }>;
  };
  timestamp: number;
}>();
expectTypeOf<TraceLimits>().toEqualTypeOf<{
  depth: number;
  breadth: number;
  stringLength: number;
  totalSize: number;
}>();
expectTypeOf<TracePrivacy>().toEqualTypeOf<{
  redact?: (key: string, path: string) => boolean;
  limits?: Partial<TraceLimits>;
}>();
expectTypeOf<TraceSchema>().toEqualTypeOf<{
  traits?: Record<string, StandardSchema<unknown, unknown>>;
  groups?: Record<string, Record<string, StandardSchema<unknown, unknown>>>;
}>();
expectTypeOf<TraitsOf<{ traits: { plan: typeof plan } }>>().toEqualTypeOf<{
  plan: Plan;
}>();
expectTypeOf<
  GroupsOf<{ groups: { workspace: { tier: typeof tier } } }>
>().toEqualTypeOf<{ workspace: { tier: string } }>();
expectTypeOf<
  TraceOptions<
    Events,
    ProductOnly,
    { traits: { plan: typeof plan } },
    "analytics"
  >
>().toEqualTypeOf<{
  events: Events;
  destinations: ProductOnly;
  schema?: { traits: { plan: typeof plan } };
  defaults?: {
    to?: "product"[] | ((event: TrackedEventOf<Events>) => "product"[]);
    context?: Record<string, unknown>;
  };
  consent?: Partial<Record<"product", "analytics"[] | []>>;
  privacy?: TracePrivacy;
  buffer?: { capacity?: number; maxAge?: number };
  timeout?: number;
  now?: () => number;
}>();
expectTypeOf<keyof TraceScope<Events, Destination>>().toEqualTypeOf<"track">();
expectTypeOf(scope.track<"App Opened">).toEqualTypeOf<
  (
    name: "App Opened",
    properties?: undefined,
    options?: TrackOptions<Destination>,
  ) => Receipt<Destination>
>();
expectTypeOf(scope.track<"Search Performed">).toEqualTypeOf<
  (
    name: "Search Performed",
    properties: { query: string },
    options?: TrackOptions<Destination>,
  ) => Receipt<Destination>
>();
expectTypeOf(scope.track<"Checkout Started">).toEqualTypeOf<
  (
    name: "Checkout Started",
    properties: Checkout,
    options?: TrackOptions<Destination>,
  ) => Receipt<Destination>
>();
expectTypeOf<
  keyof EventDefinition<Checkout, Required<Checkout>>
>().toEqualTypeOf<"parse">();
expectTypeOf<
  EventDefinition<Checkout, Required<Checkout>>["parse"]
>().toEqualTypeOf<
  (
    input: Checkout,
  ) =>
    | { ok: true; properties: Required<Checkout> }
    | { ok: false; issues: { path: string; message: string }[] }
>();
expectTypeOf<ParseResult<Checkout>>().toEqualTypeOf<
  | { ok: true; properties: Checkout }
  | { ok: false; issues: { path: string; message: string }[] }
>();
expectTypeOf<
  EventDefinition<Checkout, Required<Checkout>>["parse"]
>().returns.toEqualTypeOf<ParseResult<Required<Checkout>>>();
expectTypeOf<StandardSchema<string, number>>().toEqualTypeOf<{
  "~standard": {
    version: 1;
    vendor: string;
    types?: { input: string; output: number } | undefined;
    validate: (value: unknown) => SchemaResult | Promise<SchemaResult>;
  };
}>();

expectTypeOf<keyof AnalyticsAdapter>().toEqualTypeOf<"name" | "open">();
expectTypeOf<AnalyticsAdapter<{ sdkVersion: string }>["open"]>().toEqualTypeOf<
  () => AnalyticsSession<{ sdkVersion: string }>
>();
expectTypeOf<keyof AnalyticsSession>().toEqualTypeOf<
  | "native"
  | "track"
  | "identify"
  | "traits"
  | "group"
  | "reset"
  | "collection"
  | "flush"
  | "dispose"
>();
expectTypeOf(session.track).toEqualTypeOf<
  (
    event: TrackedEvent,
    context: TrackContext,
  ) => TrackResult | Promise<TrackResult>
>();
expectTypeOf<TrackContext>().toEqualTypeOf<{
  signal: AbortSignal;
  currentGeneration: () => number;
  now: () => number;
}>();
expectTypeOf<IdentifyUpdate>().toEqualTypeOf<{ user: { id: string } }>();
expectTypeOf<TraitsUpdate>().toEqualTypeOf<{
  user: { id: string } | null;
  set: Record<string, unknown>;
  remove: string[];
}>();
expectTypeOf<GroupUpdate>().toEqualTypeOf<{
  user: { id: string } | null;
  group: { type: string; id: string | null; traits: Record<string, unknown> };
}>();
expectTypeOf<FlushContext>().toEqualTypeOf<{
  timeout: number;
  signal: AbortSignal;
}>();
expectTypeOf<Destinations>().toEqualTypeOf<Record<string, AnalyticsAdapter>>();
expectTypeOf<
  DestinationName<{ product: typeof product; research: AnalyticsAdapter }>
>().toEqualTypeOf<Destination>();
expectTypeOf<NativeOf<{ product: typeof product }>>().toEqualTypeOf<{
  product: { sdkVersion: string };
}>();

expectTypeOf(createMockAdapter).parameters.toEqualTypeOf<
  [options?: MockAdapterOptions]
>();
expectTypeOf(createMockAdapter()).toEqualTypeOf<{
  adapter: AnalyticsAdapter<MockSession>;
  sessions: MockSession[];
  tracks: MockTrack[];
}>();
expectTypeOf<MockAdapterOptions>().toEqualTypeOf<{
  name?: string;
  hold?: boolean;
  identity?: boolean;
  collection?: boolean;
  flush?: boolean | "hold";
  onOpen?: () => void;
  onTrack?: (track: MockTrack) => TrackResult | void;
  onIdentity?: (call: MockIdentityCall) => void | Promise<void>;
}>();
expectTypeOf<MockIdentityCall>().toEqualTypeOf<
  | { kind: "identify"; user: { id: string } }
  | {
      kind: "traits";
      user: { id: string } | null;
      set: Record<string, unknown>;
      remove: string[];
    }
  | {
      kind: "group";
      user: { id: string } | null;
      group: {
        type: string;
        id: string | null;
        traits: Record<string, unknown>;
      };
    }
  | { kind: "reset" }
>();
expectTypeOf<MockTrack>().toEqualTypeOf<{
  event: TrackedEvent;
  context: TrackContext;
  settle: (result?: TrackResult) => void;
  fail: (error: unknown) => void;
}>();
expectTypeOf<MockFlush>().toEqualTypeOf<{
  context: FlushContext;
  settle: (result?: FlushResult) => void;
  fail: (error: unknown) => void;
}>();
expectTypeOf<MockSession>().toEqualTypeOf<{
  events: TrackedEvent[];
  identity: MockIdentityCall[];
  collection: boolean[];
  flushes: MockFlush[];
  disposeCount: number;
}>();
expectTypeOf(testAnalyticsAdapter).toEqualTypeOf<
  (options: AnalyticsConformanceOptions) => void
>();
expectTypeOf<AnalyticsConformanceOptions>().toEqualTypeOf<{
  name: string;
  createAdapter: () => AnalyticsAdapter;
}>();

// @ts-expect-error "Wishlist Shared" was never declared.
trace.track("Wishlist Shared");
// @ts-expect-error A query is a string.
trace.track("Search Performed", { query: 1 });
// @ts-expect-error Checkout Started requires its properties.
trace.track("Checkout Started");
// @ts-expect-error App Opened takes no properties.
trace.track("App Opened", { screen: "home" });
// @ts-expect-error "warehouse" is not a configured destination.
trace.track("App Opened", undefined, { to: ["warehouse"] });
// @ts-expect-error A user needs an id.
trace.user({ traits: { plan: "pro" } });
// @ts-expect-error "role" is not a declared trait.
trace.traits({ role: "admin" });
// @ts-expect-error "team" is not a declared group type.
trace.group("team", { id: "t_1" });
// @ts-expect-error "marketing" is not a declared purpose.
trace.consent.set({ marketing: "granted" });

// @ts-expect-error Identity is trace.user({ id }), so there is no identify.
trace.identify("ada");
// @ts-expect-error Signing out is trace.user(null), so there is no reset.
trace.reset();
// @ts-expect-error There is no dry run; tests use the mock adapter.
trace.inspect("App Opened");
// @ts-expect-error A trait is removed by setting it to null.
trace.traits.remove("plan");
// @ts-expect-error A group is left with trace.group(type, null).
trace.group.clear("workspace");
// @ts-expect-error trace.track is the only way to track.
trace.events.checkoutStarted();
// @ts-expect-error The flush option is timeout, in milliseconds.
export const flushed = trace.flush({ timeoutMs: 1_000 });
// @ts-expect-error An event is declared by its key in the registry, so event takes no name.
export const named = event({ name: "x" });
// @ts-expect-error The event's name is its key, so there is no eventKey.
export const eventKey = tracked.eventKey;
export const removed = [DEFAULT_REDACT, createAnalyticsAdapter];

export const withDeadline = new Trace({
  events,
  destinations: { product },
  // @ts-expect-error The deadline of one provider call is timeout.
  deadlineMs: 5_000,
});

export const withStartTimeout = new Trace({
  events,
  destinations: { product },
  // @ts-expect-error Opening is synchronous, so there is no start timeout.
  startTimeoutMs: 5_000,
});

export const withMaxEvents = new Trace({
  events,
  destinations: { product },
  buffer: {
    // @ts-expect-error A buffer's size is capacity.
    maxEvents: 100,
  },
});

export const withMaxAgeMs = new Trace({
  events,
  destinations: { product },
  buffer: {
    // @ts-expect-error A buffer's age limit is maxAge, in milliseconds.
    maxAgeMs: 30_000,
  },
});

export const withRuleList = new Trace({
  events,
  destinations: { product },
  privacy: {
    // @ts-expect-error redact is a predicate of the key and its path, never a list of rules.
    redact: [/token/],
  },
});

export const owned: AnalyticsAdapter = {
  name: "owned",
  open: () => session,
  // @ts-expect-error The application owns every SDK, so an adapter declares no ownership.
  ownership: "managed",
};

export const capable: AnalyticsAdapter = {
  name: "capable",
  open: () => session,
  // @ts-expect-error The methods a session has say what it can do, so an adapter declares no capabilities.
  capabilities: { identity: "native" },
};

export const occurred: TrackOptions = {
  // @ts-expect-error An event's time is timestamp.
  occurredAt: 1_700_000_000_000,
};
