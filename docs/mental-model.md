---
description: "The path an event takes through Trace, what happens inside each destination, what the core owns, what an adapter owns, and the rules that explain most behavior."
---

# The mental model

One `Trace` per application holds named destinations. An event is built once by the core and handed, frozen, to each destination it was routed to.

```ts
import { Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { http } from "@priemskiyyy/trace-http";
import { posthog } from "@priemskiyyy/trace-posthog";
import posthogJs from "posthog-js";

const trace = new Trace({
  events,
  destinations: {
    research: posthog({ sdk: posthogJs }),
    backend: http({ request: sendEvent }),
    console: console(),
  },
  defaults: { to: ["research", "backend"] },
  consent: { research: ["analytics"] },
});
```

## The path of an event

`trace.track(name, properties, options)` runs these steps. Each refusal answers a receipt that is `dropped` at once, with the reason in parentheses.

1. **Refusals that need no work.** After `dispose()` (`disposed`); from inside an adapter call, an `events` listener or a diagnostics listener (`reentrant`), which would otherwise loop; and with a name that is not a string, or options that are not an object or cannot be read (`invalid`).
2. **Candidates.** The event's own `to`, else a `defaults.to` list, else every destination. When the candidates name no destination this Trace has, as an empty list or a `to` that is not a list does, the event is dropped (`not-routed`), and when consent closes every candidate, it is dropped (`consent`), in both cases before anything is validated, sanitized or kept.
3. **Validation.** The event's declaration checks its properties (`invalid`, with the issues).
4. **Context.** `defaults.context`, then `trace.context()`, then the scope's context, then the call's, a later layer winning key by key.
5. **Sanitizing.** Properties and context are redacted and bounded. A `redact` that throws costs the event (`sanitizer-failed`).
6. **Freezing.** The event gets its id, the current identity and its time, the call's `timestamp` or the clock, and is deep-frozen.
7. **Routing.** The route is resolved again: a `defaults.to` function is asked now, with the finished event, and destinations that consent closes are left out. When none is left, the event is dropped (`not-routed` or `consent`).
8. **The stream.** Every `trace.events` listener receives the event.
9. **Hand-off.** The event is queued on each destination left, and the receipt is `pending` with one slot for each.

Traits, group traits and the context you set with `trace.context()` are validated and sanitized when they are set, not when an event is tracked. That keeps unsanitized data out of every buffer, stream, diagnostic and adapter.

## Inside a destination

Each destination has a lane of its own, and what happens there happens independently of every other destination.

- **Waiting.** Before `start()`, while the destination's start has failed, or while the event ahead waits for identity steps, an event waits in a buffer that holds 100 events for up to 30 seconds by default.
- **Consent, again.** Consent is checked once more right before the hand-off, so a revocation that lands between `track` and the hand-off wins.
- **Identity first.** Trace compares what the provider last applied with the identity the event carries, and sends the steps the provider needs to hold that identity: `reset`, `identify`, `traits`, `group`. Each step is awaited before the next one and before the event, so an event never overtakes its own identity.
- **The hand-off.** The adapter gets the event under a deadline, `timeout`, 5000 ms by default, and its answer lands on the receipt. The first answer stands. Hand-offs do not wait for each other, so one slow call never holds up the next event.

See [users and account switching](users.md) for the identity steps and [receipts and evidence](receipts.md) for every answer.

## What the core owns, and what an adapter owns

The core owns policy: validation, sanitizing, identity generations and identity planning for each destination, consent, routing, buffering, deadlines, receipts and diagnostics. An adapter translates one sanitized event for one provider and does nothing else. The core never branches on which provider it is talking to, and an adapter only ever receives data the core already sanitized.

When a provider cannot do something, the adapter does not imitate it. It records what was lost on the receipt, skips the event with a reason, or reports the identity step as unsupported. Plausible, for example, forbids identifiers, so its adapter has no identity methods and Trace plans none for it. See [provider limitations](provider-limitations.md).

## Rules that explain most behavior

- **Privacy outranks delivery.** A `redact` that throws costs the event. A `defaults.to` function that throws costs the event too, rather than sending it anywhere else.
- **Consent fails closed.** `unknown` and `denied` close a destination, and a `consent` entry that is not a list of purpose strings throws at construction rather than leave it open.
- **An event keeps what it was accepted with.** Its identity, context and time are fixed when `track` returns. When the user switches or signs out, what the previous user left waiting is dropped instead of sent under the next one.
- **Delivery outranks metadata.** A trait that fails its schema costs only itself, never the user, the other traits or an event.
- **Trace never takes the application down.** Tracking, the identity calls, consent, `start`, `flush` and `dispose` never throw. Only programming mistakes throw, so that you find them at once: a constructor given options that cannot work, `destination()` for a name you never configured, a binding hook outside its provider, `fromAmpli` with a key that differs from the generated class's name, and mounting the devtools twice.
- **Observation is passive.** Reading a status, a native handle, the `events` stream or diagnostics opens nothing and tracks nothing.
