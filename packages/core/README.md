# @priemskiyyy/trace

Typed, provider-independent product analytics for TypeScript, on the web, in React Native and on servers. The core owns how an event is declared, validated, sanitized, given its identity, gated by consent, routed and handed to each destination, and it answers a receipt that says what each destination did with it. Adapters translate one sanitized event for Amplitude, PostHog, Mixpanel, Segment, Google Analytics, Firebase, your own backend or the console, over an SDK your application already initialized.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

No dependencies, ESM only, no side effects on import.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-console
```

## Use it

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

export const trace = new Trace({
  events: {
    "App Opened": event(),
    "Search Performed": event<{ query: string }>(),
  },
  destinations: { console: console() },
});

trace.start();
trace.user({ id: "user_42" });

const receipt = trace.track("Search Performed", { query: "shoes" });
```

Creating a Trace starts nothing. `start()` opens the destinations, and an event tracked before that waits in a bounded buffer. `track()` is synchronous and never throws, and its receipt settles once every destination has answered.

## The Trace

| Member                               | What it does                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `start()`                            | Opens every destination. A repeat retries only the ones that failed.                                         |
| `track(name, properties?, options?)` | Accepts one declared event and answers its receipt.                                                          |
| `user(user \| null)`                 | Sets who events belong to, or signs out. A different user, or signing out, starts a new identity generation. |
| `traits(traits)`                     | Merges traits into the current user or visitor. A `null` removes one.                                        |
| `group(type, group \| null)`         | Sets the membership for one group type, or leaves it.                                                        |
| `context(context)`                   | Merges into the context every event carries. A `null` removes a key.                                         |
| `scope({ context })`                 | A `track` bound to one more context layer.                                                                   |
| `consent`                            | The decision for each purpose the `consent` option names, with `set(decisions)`.                             |
| `events`                             | The stream of accepted events. Subscribing creates no demand.                                                |
| `flush({ timeout? })`                | Waits, bounded, for the work accepted before the call and for each provider's own flush. 2000 ms by default. |
| `destination(name)`                  | One destination's status and its native SDK handle.                                                          |
| `dispose()`                          | Releases every destination. Synchronous and idempotent.                                                      |
| `status`, `diagnostics`              | Observable state. Reading them starts nothing and carries no event content.                                  |

## Options

Durations are in milliseconds.

| Option         | Default                             | Meaning                                                                                                                                                                          |
| -------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`       | required                            | The registry: event names as keys, each declared with `event()`, `event<TProperties>()` or `event(schema)`.                                                                      |
| `destinations` | required                            | Adapters by destination name. The names are typed everywhere.                                                                                                                    |
| `schema`       | none                                | Standard Schema validators for `traits` and for the traits of each group type.                                                                                                   |
| `defaults`     | none                                | `to`, where an event goes: a list, or a function of the finished event, every destination if omitted. An event's own `to` replaces it. And `context`, which every event carries. |
| `consent`      | none                                | The purposes each destination needs. A destination the option does not name is never gated.                                                                                      |
| `privacy`      | `isSensitiveKey` and default limits | A `redact(key, path)` predicate and size `limits`.                                                                                                                               |
| `buffer`       | `{ capacity: 100, maxAge: 30000 }`  | Bounds of what one destination holds before it is ready.                                                                                                                         |
| `timeout`      | 5000                                | After this, a provider call settles as `indeterminate`.                                                                                                                          |
| `now`          | `Date.now`                          | The clock, for tests.                                                                                                                                                            |

Misconfiguration throws a `TraceError` with the code `INVALID_CONFIGURATION`: from the constructor, for `events` that are not a plain object, a destination that is not an adapter, a name in `consent` or in a `defaults.to` list that no destination has, an empty event name, a `redact` that is not a function, a count or duration that is not a whole number of 0 or more, a duration over 2147483647, a `schema` or a part of it that is present and not an object, `null` included, or a `defaults.context` that cannot be sanitized, and from `destination()` for a name that was never configured. An option set to `undefined` keeps its default. Nothing on the tracking path throws.

## Other entries

**`@priemskiyyy/trace/mock`** is a deterministic adapter for your tests. It records every call and hands back the frozen event exactly as a destination received it, and it can hold, fail and misbehave on command.

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";

const mock = createMockAdapter();

const trace = new Trace({
  events: { "App Opened": event() },
  destinations: { mock: mock.adapter },
});

trace.start();

await trace.track("App Opened").settled;

console.log(mock.sessions[0]?.events[0]?.name);
```

**`@priemskiyyy/trace/testing`** registers the contract every adapter must keep. It needs `vitest`, which is an optional peer for that reason.

The main entry also exports `TraceError`, the error Trace itself creates, with a `code` to branch on; `event`, which declares one event of the registry; `isSensitiveKey`, the default `redact`, to extend it; and every public type, `AnalyticsAdapter` among them.

## Writing an adapter

An adapter is a plain `{ name, open }`. Creating it reads nothing, and `open` returns a session over the SDK your application already initialized. The session maps one frozen, sanitized event onto its provider and answers what happened. It has only the identity methods its provider can honor, so Trace plans identity for exactly what the provider can do.

```ts
import type { AnalyticsAdapter } from "@priemskiyyy/trace";

type LogLike = { write: (line: string) => void };

export const log = ({ sdk }: { sdk: LogLike }): AnalyticsAdapter<LogLike> => ({
  name: "log",
  open: () => ({
    native: sdk,
    track: (event) => {
      sdk.write(JSON.stringify(event));

      return { status: "submitted", evidence: "sdk-call-returned" };
    },
  }),
});
```

Then hold it to the contract in its `src/conformance.test.ts`:

<!-- snippet: fragment -->

```ts
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

testAnalyticsAdapter({
  name: "log",
  createAdapter: () => log({ sdk: { write: () => {} } }),
});
```

The suite runs over an event and identity updates that a real Trace produced. It cannot see whether the factory is cold, how each field is mapped or what evidence the provider really gives, so an adapter tests those in its own tests. The rules every adapter keeps, and the package layout, are in the [architecture](../../docs/internals/architecture.md#the-adapter-contract).

## Documentation

- The [runtime architecture](../../docs/internals/architecture.md): the owners, the path of an event, the rules each lane keeps, and the test that guards each release gate and invariant.

## Tests

The tests run over the mock adapter with an injected clock. They pin each release gate and invariant listed in the [architecture](../../docs/internals/architecture.md#release-gates-and-their-tests), among them seeded sweeps of interleaved users, sign-outs, consent changes and tracks over destinations that answer at once, open late or hold their calls, an account switch while events are buffered and in flight, late, duplicate and malformed provider answers, and disposal at every stage. A generated registry of 500 events keeps the types' cost in check. Nothing here talks to a provider.

## License

[MIT](LICENSE)
