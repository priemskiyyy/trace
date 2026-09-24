---
description: "Every public export of Trace: the core class and its types, the mock and testing entries, the React, Vue, Solid and Svelte bindings, every adapter, and the devtools."
---

# API reference

Every public export, by package. Guides with examples are linked from each section.

```ts
import { Trace, event } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { console: console() },
});

trace.start();
trace.track("App Opened");
```

## `@priemskiyyy/trace`

### `new Trace(options)`

| Member                               | Signature                                                                 | Notes                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                             | `ObservableValue<TraceStatus>`                                            | `idle`, `started` or `disposed`, as interned objects.                                                                                                 |
| `diagnostics`                        | `TraceDiagnostics`                                                        | A passive snapshot plus a timeline of diagnostic events, assembled only while observed.                                                               |
| `events`                             | `TraceEvents<TEvents>`                                                    | The stream of accepted events. `subscribe` never replays.                                                                                             |
| `consent`                            | `TraceConsent<TPurpose>`                                                  | `get()`, `subscribe(listener?)` and `set(decisions)` for each configured purpose.                                                                     |
| `start()`                            | `() => void`                                                              | Opens every destination; a later call retries only the ones that failed.                                                                              |
| `track(name, properties?, options?)` | `(name, ...args) => Receipt<TDestinationName>`                            | Synchronous, never throws. See [tracking and receipts](tracking.md).                                                                                  |
| `user(user \| null)`                 | `(user: { id: string; traits?: ... } \| null) => void`                    | Signs a user in, or out with `null`. See [users](users.md).                                                                                           |
| `traits(traits)`                     | `(traits: Record<string, unknown \| null>) => void`                       | Merges into the current user or visitor; `null` removes a key.                                                                                        |
| `group(type, group \| null)`         | `(type, group: { id, traits? } \| null) => void`                          | Sets or leaves one group type's membership. See [groups](groups.md).                                                                                  |
| `context(context)`                   | `(context: Record<string, unknown \| null>) => void`                      | Merges into the context every event carries; survives user changes. A context that cannot be sanitized changes nothing and records `context refused`. |
| `scope(options)`                     | `(options: { context }) => TraceScope<TEvents, TDestinationName>`         | A `track` bound to one more context layer. See [scopes](context-and-scopes.md#scopes).                                                                |
| `destination(name)`                  | `(name) => DestinationHandle<TNative>`                                    | The escape hatch to one destination's status and SDK. See [native access](native-access.md).                                                          |
| `flush(options?)`                    | `(options?: { timeout? }) => Promise<TraceFlushResult<TDestinationName>>` | Never rejects. See [flush](flush.md).                                                                                                                 |
| `dispose()`                          | `() => void`                                                              | Releases every destination synchronously. Later calls do nothing.                                                                                     |

The constructor throws `TraceError` `INVALID_CONFIGURATION` for the refusals in [what the constructor refuses](configuration.md#what-the-constructor-refuses); `destination(name)` throws the same code for a name that was never configured.

### `event()`

```ts
import type { EventDefinition, StandardSchema } from "@priemskiyyy/trace";

// InferInput and InferOutput are internal helper types, present in the
// bundled declarations but not part of the public export list.
type InferOutput<TSchema> =
  TSchema extends StandardSchema<unknown, infer TOutput> ? TOutput : never;
type InferInput<TSchema> = TSchema extends StandardSchema
  ? "types" extends keyof TSchema["~standard"]
    ? NonNullable<TSchema["~standard"]["types"]>["input"]
    : InferOutput<TSchema>
  : never;

declare function event(): EventDefinition<undefined, Record<string, never>>;
declare function event<TProperties extends object>(): EventDefinition<
  TProperties,
  TProperties
>;
declare function event<TSchema extends StandardSchema<object, object>>(
  schema: TSchema,
): EventDefinition<InferInput<TSchema>, InferOutput<TSchema>>;
```

Declares one event of the registry; the third overload infers the schema's own input and output types. See [events and schemas](events.md).

### `TraceError`

```ts
import type { TraceErrorCode } from "@priemskiyyy/trace";

declare class TraceError extends Error {
  constructor(options: {
    code: TraceErrorCode;
    message: string;
    cause?: unknown;
  });
  code: TraceErrorCode;
}
```

`TraceErrorCode` is `"INVALID_CONFIGURATION" | "NOT_INITIALIZED" | "UNSUPPORTED" | "INVALID_ANSWER" | "DELIVERY_FAILED"`. A provider SDK's own thrown value reaches a receipt or a status exactly as it was thrown, never wrapped in a `TraceError`.

### `isSensitiveKey(key)`

`(key: string) => boolean`. The default `privacy.redact`: whether a key names a credential. See [privacy and redaction](privacy.md).

### Types

| Type                                                      | Definition                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AnalyticsAdapter<TNative>`                               | `{ name: string; open: () => AnalyticsSession<TNative> }`, the adapter contract                                                                  |
| `AnalyticsSession<TNative>`                               | `{ native; track; identify?; traits?; group?; reset?; collection?; flush?; dispose? }`                                                           |
| `ConsentDecision`                                         | `"unknown" \| "granted" \| "denied"`                                                                                                             |
| `Destinations`                                            | `Record<string, AnalyticsAdapter>`, the shape of the `destinations` option                                                                       |
| `DestinationName<TDestinations>`                          | The configured destination names, typed from `TDestinations`                                                                                     |
| `DestinationHandle<TNative>`                              | `{ status: ObservableValue<DestinationStatus>; native: TNative \| null }`                                                                        |
| `DestinationStatus`                                       | `{ state: "idle" } \| { state: "ready" } \| { state: "failed"; error } \| { state: "disposed" }`                                                 |
| `DestinationOutcome`                                      | One destination's outcome: `submitted`, `dropped`, `skipped`, `failed` or `indeterminate`. See [receipts](receipts.md#outcomes-per-destination). |
| `DestinationFlushResult`                                  | A destination's flush answer: `FlushResult`, `{ status: "unsupported" }` or `{ status: "not-ready" }`                                            |
| `DropReason`                                              | Why a whole event was dropped: `invalid`, `sanitizer-failed`, `consent`, `not-routed`, `reentrant` or `disposed`                                 |
| `EventDefinition<TInput, TOutput>`                        | `{ parse: (input) => ParseResult<TOutput> }`, what `event()` returns                                                                             |
| `EventName<TEvents>`                                      | The declared event names, typed from `TEvents`                                                                                                   |
| `EventProperties<TDefinition>`                            | The properties a declared event carries once parsed                                                                                              |
| `FlushContext`                                            | `{ timeout: number; signal: AbortSignal }`, given to an adapter's `flush`                                                                        |
| `FlushResult`                                             | `{ status: "flushed" } \| { status: "timeout" } \| { status: "failed"; error }`                                                                  |
| `GroupsOf<TSchema>`                                       | The group types and trait shapes declared in `schema.groups`                                                                                     |
| `GroupUpdate`                                             | `{ user: { id } \| null; group: { type; id: string \| null; traits } }`, given to an adapter's `group`                                           |
| `IdentifyUpdate`                                          | `{ user: { id: string } }`, given to an adapter's `identify`                                                                                     |
| `MappingLoss`                                             | `{ path: string; reason: "redacted" \| "truncated" \| "invalid" \| "unsupported" \| "omitted" \| "coerced" }`                                    |
| `NativeOf<TDestinations>`                                 | Each destination name mapped to its adapter's native SDK type                                                                                    |
| `ObservableValue<T>`                                      | `{ get(): T; subscribe(listener?): () => void }`                                                                                                 |
| `ParseResult<TOutput>`                                    | `{ ok: true; properties: TOutput } \| { ok: false; issues }`, what `EventDefinition.parse` answers                                               |
| `Receipt<TName>`                                          | `{ id: string; status: ObservableValue<ReceiptStatus<TName>>; settled: Promise<ReceiptStatus<TName>> }`                                          |
| `ReceiptStatus<TName>`                                    | `dropped`, `pending` or `settled`, with each destination's outcome. See [receipts](receipts.md#the-three-states).                                |
| `StandardSchema<TInput, TOutput>`                         | The Standard Schema v1 contract `event()` accepts                                                                                                |
| `TraceConsent<TPurpose>`                                  | `{ get(); subscribe(listener?); set(decisions) }`                                                                                                |
| `TraceDiagnosticEvent`                                    | One diagnostic, named by a `TraceDiagnosticType`, never carrying event data, a trait value or a provider's error                                 |
| `TraceDiagnostics`                                        | `ObservableValue<TraceSnapshot> & { events: { subscribe } }`                                                                                     |
| `TraceDiagnosticType`                                     | The closed union of diagnostic phrases, from `trace started` to `listener failed`, `context refused` included, to dispatch on exhaustively       |
| `TraceErrorCode`                                          | The five codes `TraceError.code` can hold                                                                                                        |
| `TraceEvents<TEvents>`                                    | `{ subscribe: (listener: (event: TrackedEventOf<TEvents>) => void) => () => void }`                                                              |
| `TraceFlushResult<TName>`                                 | `{ drained: boolean; destinations: Partial<Record<TName, DestinationFlushResult>> }`                                                             |
| `TraceLimits`                                             | `{ depth; breadth; stringLength; totalSize }`, the bounds `privacy.limits` sets. See [bounds](privacy.md#bounds).                                |
| `TraceOptions<TEvents, TDestinations, TSchema, TPurpose>` | The constructor's options. See [configuration](configuration.md).                                                                                |
| `TracePrivacy`                                            | `{ redact?; limits? }`, the `privacy` option                                                                                                     |
| `TraceSchema`                                             | `{ traits?: Record<string, StandardSchema>; groups?: Record<string, Record<string, StandardSchema>> }`                                           |
| `TraceScope<TEvents, TName>`                              | `{ track }`, a `track` bound to one more context layer, returned by `scope()`                                                                    |
| `TraceSnapshot`                                           | Frozen counts and each destination's state from `diagnostics.get()`; never event data or a provider's error                                      |
| `TraceStatus`                                             | `{ state: "idle" \| "started" \| "disposed" }`                                                                                                   |
| `TrackContext`                                            | `{ signal: AbortSignal; currentGeneration: () => number; now: () => number }`, given to an adapter's `track`                                     |
| `TrackedEvent<TName, TProperties>`                        | The frozen, sanitized event every destination and `trace.events` receives                                                                        |
| `TrackedEventOf<TEvents>`                                 | The union of `TrackedEvent` over a whole registry, discriminated by `name`                                                                       |
| `TrackEvidence`                                           | `"sdk-call-returned" \| "sdk-callback-completed" \| "backend-acknowledged"`. See [evidence](receipts.md#evidence).                               |
| `TrackOptions<TName>`                                     | `{ to?; context?; timestamp? }`, the third argument of `track()`                                                                                 |
| `TrackResult`                                             | What an adapter's `track` answers: `submitted`, `dropped`, `skipped`, `failed` or `indeterminate`                                                |
| `TraitsOf<TSchema>`                                       | The trait shape declared in `schema.traits`                                                                                                      |
| `TraitsUpdate`                                            | `{ user: { id } \| null; set; remove }`, given to an adapter's `traits`                                                                          |

## `@priemskiyyy/trace/mock`

```ts
import type { AnalyticsAdapter } from "@priemskiyyy/trace";
import type {
  MockAdapterOptions,
  MockSession,
  MockTrack,
} from "@priemskiyyy/trace/mock";

declare function createMockAdapter(options?: MockAdapterOptions): {
  adapter: AnalyticsAdapter<MockSession>;
  sessions: MockSession[];
  tracks: MockTrack[];
};
```

| Type                 | Definition                                                                             |
| -------------------- | -------------------------------------------------------------------------------------- |
| `MockAdapterOptions` | `{ name?; hold?; identity?; collection?; flush?; onOpen?; onTrack?; onIdentity? }`     |
| `MockSession`        | `{ events; identity; collection; flushes; disposeCount }`, also the session's `native` |
| `MockTrack`          | `{ event; context; settle(result?); fail(error) }`, one held `track`                   |
| `MockFlush`          | `{ context; settle(result?); fail(error) }`, one held `flush`                          |
| `MockIdentityCall`   | One `identify`, `traits`, `group` or `reset` call, discriminated by `kind`             |

See [application testing](testing.md).

## `@priemskiyyy/trace/testing`

```ts
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

type AnalyticsConformanceOptions = {
  name: string;
  createAdapter: () => AnalyticsAdapter;
};

declare function testAnalyticsAdapter(
  options: AnalyticsConformanceOptions,
): void;
```

Registers the one conformance suite every adapter must pass, `"<name> adapter conformance"`, as a Vitest `describe`. See [writing an adapter](writing-an-adapter.md).

## `@priemskiyyy/trace-react`

| Export                                                                                  | Signature                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `TraceProvider`                                                                         | `({ trace: RegisteredTrace; children }) => ReactNode`       |
| `useTrace`                                                                              | `() => RegisteredTrace`                                     |
| `useTraceStatus`                                                                        | `(onChange?) => TraceStatus`                                |
| `useDestinationStatus`                                                                  | `(name, onChange?) => DestinationStatus`                    |
| `useConsent`                                                                            | `(onChange?) => Record<RegisteredPurpose, ConsentDecision>` |
| `Register`                                                                              | The interface to augment with `{ trace: typeof trace }`     |
| `RegisteredTrace`, `RegisteredEvents`, `RegisteredDestinationName`, `RegisteredPurpose` | Types derived from `Register`                               |
| `TraceProviderProps`                                                                    | The provider's props                                        |

[React](react.md).

## `@priemskiyyy/trace-vue`

| Export                              | Signature                                                                |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `TraceProvider`                     | A component with a required `trace` prop                                 |
| `useTrace`                          | `() => ComputedRef<RegisteredTrace>`                                     |
| `useTraceStatus`                    | `(onChange?) => ComputedRef<TraceStatus>`                                |
| `useDestinationStatus`              | `(name \| Ref \| getter, onChange?) => ComputedRef<DestinationStatus>`   |
| `useConsent`                        | `(onChange?) => ComputedRef<Record<RegisteredPurpose, ConsentDecision>>` |
| `Register` and the registered types | As in React                                                              |

[Vue](vue.md).

## `@priemskiyyy/trace-solid`

| Export                              | Signature                                                             |
| ----------------------------------- | --------------------------------------------------------------------- |
| `TraceProvider`                     | `(props: { trace; children }) => JSX.Element`                         |
| `useTrace`                          | `() => Accessor<RegisteredTrace>`                                     |
| `useTraceStatus`                    | `(onChange?) => Accessor<TraceStatus>`                                |
| `useDestinationStatus`              | `(name \| accessor, onChange?) => Accessor<DestinationStatus>`        |
| `useConsent`                        | `(onChange?) => Accessor<Record<RegisteredPurpose, ConsentDecision>>` |
| `Register` and the registered types | As in React                                                           |

[Solid](solid.md).

## `@priemskiyyy/trace-svelte`

| Export                              | Signature                                                                |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `TraceProvider`                     | A `.svelte` component with a required `trace` prop                       |
| `useTrace`                          | `() => { current: RegisteredTrace }`                                     |
| `useTraceStatus`                    | `(onChange?) => { current: TraceStatus }`                                |
| `useDestinationStatus`              | `(name \| getter, onChange?) => { current: DestinationStatus }`          |
| `useConsent`                        | `(onChange?) => { current: Record<RegisteredPurpose, ConsentDecision> }` |
| `ReadableValue<T>`                  | `{ current: T }`, what every utility returns                             |
| `Register` and the registered types | As in React                                                              |

[Svelte](svelte.md).

## Adapters

| Package                                    | Factory                                | Options type                    |
| ------------------------------------------ | -------------------------------------- | ------------------------------- |
| `@priemskiyyy/trace-console`               | `console`                              | `ConsoleAdapterOptions`         |
| `@priemskiyyy/trace-ampli`                 | `ampli`, `fromAmpli`, `identityPlugin` | `AmpliAdapterOptions`           |
| `@priemskiyyy/trace-amplitude`             | `amplitude`, `identityPlugin`          | `AmplitudeAdapterOptions`       |
| `@priemskiyyy/trace-amplitude-node`        | `amplitude`                            | `AmplitudeAdapterOptions`       |
| `@priemskiyyy/trace-posthog`               | `posthog`                              | `PostHogAdapterOptions`         |
| `@priemskiyyy/trace-posthog-node`          | `posthog`                              | `PostHogAdapterOptions`         |
| `@priemskiyyy/trace-posthog-react-native`  | `posthog`                              | `PostHogAdapterOptions`         |
| `@priemskiyyy/trace-mixpanel`              | `mixpanel`                             | `MixpanelAdapterOptions`        |
| `@priemskiyyy/trace-mixpanel-node`         | `mixpanel`                             | `MixpanelAdapterOptions`        |
| `@priemskiyyy/trace-mixpanel-react-native` | `mixpanel`                             | `MixpanelAdapterOptions`        |
| `@priemskiyyy/trace-segment`               | `segment`                              | `SegmentAdapterOptions`         |
| `@priemskiyyy/trace-segment-node`          | `segment`                              | `SegmentAdapterOptions`         |
| `@priemskiyyy/trace-segment-react-native`  | `segment`                              | `SegmentAdapterOptions`         |
| `@priemskiyyy/trace-rudderstack`           | `rudderstack`                          | `RudderStackAdapterOptions`     |
| `@priemskiyyy/trace-google-analytics`      | `googleAnalytics`, `ga4`               | `GoogleAnalyticsAdapterOptions` |
| `@priemskiyyy/trace-firebase`              | `firebase`, `ga4`                      | `FirebaseAdapterOptions`        |
| `@priemskiyyy/trace-firebase-react-native` | `firebase`, `ga4`                      | `FirebaseAdapterOptions`        |
| `@priemskiyyy/trace-heap`                  | `heap`                                 | `HeapAdapterOptions`            |
| `@priemskiyyy/trace-plausible`             | `plausible`                            | `PlausibleAdapterOptions`       |
| `@priemskiyyy/trace-umami`                 | `umami`                                | `UmamiAdapterOptions`           |
| `@priemskiyyy/trace-fathom`                | `fathom`                               | `FathomAdapterOptions`          |
| `@priemskiyyy/trace-vercel`                | `vercel`                               | `VercelAdapterOptions`          |
| `@priemskiyyy/trace-http`                  | `http`                                 | `HttpAdapterOptions`            |

Every package also exports its `<Name>Like` structural type, what `native` is typed as. `ga4(events, mappings)` additionally exports `Ga4Event`, `Ga4Item` and `Ga4EventMap`; `trace-ampli` also exports `AmpliEventClass` and `AmplitudeIdentifyLike`. See [choose an adapter](adapters.md) for every option and [provider limitations](provider-limitations.md) for what each cannot carry.

## `@priemskiyyy/trace-devtools`

```ts
import type { TraceDevtoolsOptions } from "@priemskiyyy/trace-devtools";

declare class TraceDevtools {
  constructor(options: TraceDevtoolsOptions);
  mount(element: HTMLElement): void;
  unmount(): void;
  setTrace(trace: unknown): void;
  setMaxEvents(count: number): void;
}
```

`TraceDevtoolsOptions` is `{ trace; initialIsOpen?; maxEvents? }`. `@priemskiyyy/trace-devtools/react`, `/vue`, `/solid` and `/svelte` each export a `TraceDevtools` wrapper that reads the Trace from its provider. See [devtools](devtools.md).

For how the lane, the identity planner and the diagnostics stream fit together, see [runtime architecture](internals/architecture.md).
