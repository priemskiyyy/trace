---
description: "Say who the user is with trace.user, change traits, sign out, and see how Trace keeps one account's events and identity away from the next account, provider by provider."
---

# Users and account switching

```ts
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.traits({ seats: 12, role: null });
trace.user(null);
```

A user has an `id` and, optionally, `traits`. The `id` is what tells two accounts apart, so it must be a string that is neither empty nor only whitespace: any other id is refused with the diagnostic `user refused`, and nothing changes. `trace.user(null)` signs out. None of these calls returns anything or throws.

## Generations

Every change of user starts a new identity generation, a number that only grows. The generation is what keeps one account's data out of the next one's:

| Call                          | Current user | Result                                                                                                                                                                |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user({ id: "ada" })`         | none         | A new generation, with the user `ada`. Traits and groups set while anonymous are kept: they described the same person.                                                |
| `user({ id: "ada", traits })` | `ada`        | The same generation. The traits merge.                                                                                                                                |
| `user({ id: "bob" })`         | `ada`        | A new generation, with the user `bob`. Traits and groups are cleared, then `bob`'s traits are set. Every provider that can reset is reset before `bob` is identified. |
| `user(null)`                  | `ada`        | A new generation, anonymous, with traits and groups cleared. Every provider that can reset is reset.                                                                  |
| `user(null)`                  | none         | Nothing happens, so a repeated sign-out never rotates anonymous ids.                                                                                                  |

The context you set with `defaults.context` and `trace.context()` stays across generations, because it describes the application, not the account.

## Events in flight

An event is complete and frozen when `track` returns, the user it belongs to included. When the user switches accounts or signs out:

- Every event of an earlier generation that still waits for a destination, in its buffer or behind an identity step, is dropped for it as `identity-changed`. One account's pending events are never sent after the next account arrived, neither under the new user nor under the old one.
- A sign-in from anonymous drops nothing. An anonymous event waiting when someone signs in is still handed over anonymous, before the sign-in reaches that provider. A provider that stamps the user when it sends, rather than when it is called, can still file it under whoever signed in meanwhile. Segment's analytics-next in the browser does so for an event still in its pipeline, and its offline buffer and retry queue stretch that window to minutes; loading it with `retryQueue: false` leaves only the tick in which the event was handed over. Segment on React Native does the same while a plugin pauses processing. See [provider limitations](provider-limitations.md).
- An event already handed to a provider is not recalled, and its receipt settles with the provider's answer. A provider that stamps the user when it sends files an event it still holds under the user it holds by then.

## What each provider receives

Trace does not replay your calls to each provider. Each destination remembers what it last applied to its provider, and before every hand-off Trace works out the steps that provider needs to hold the event's identity, using only the identity methods its adapter has:

1. `reset`, when the provider may hold someone else: another user, the same user after a sign-out or a switch the provider missed, or an anonymous state two or more generations behind.
2. `identify`, when the event has a user the provider does not hold.
3. `traits`, with the traits that changed and the ones removed.
4. `group`, for each membership that changed and each group left.

Each step is awaited before the next one and before the event, and each is bounded by `timeout`. When no event is waiting, Trace plans against the current identity, so a sign-in reaches a provider promptly, before its next event.

- **A step that fails** by throwing, rejecting or outlasting `timeout` leaves the provider's identity unknown. Trace records the diagnostic `identity step failed` and skips the event that needed the step as `identity-failed`, because sending it could file one user's event under another. The next plan starts with a reset, where the provider has one. When a step and its retry both outlast `timeout`, Trace stops calling that provider's identity methods and skips at once every event that needs a step, until one of those calls answers, so an SDK that never answers, as behind a content blocker, costs two calls rather than one per event.
- **A step the provider cannot perform** throws `TraceError` `UNSUPPORTED` from `identify`, `traits` or `group`. Trace records `identity step unsupported` and counts the step as done, so the event still goes out. A `reset` that fails, `UNSUPPORTED` included, is a failure like any other, because the provider may still hold the previous user.
- **A destination without identity methods** gets no steps. Its adapter reads `event.identity` from each event instead, as the HTTP destination does. The server adapters read each event's user the same way, and use their identity methods only to update the profile of the user an update names.

Two timing rules follow from this:

- A sign-out or a switch made before a destination opens resets that provider once, when it opens. A plain page load, or a sign-in your application restores at startup, never does.
- A consent revocation that lands while a provider still has identity steps to run leaves its identity unknown, so the next grant resets the provider before identifying again. For an anonymous user, that reset starts a new device id.

How each provider takes these steps, and which ones it cannot, is on its page. See [choose an adapter](adapters.md).

## After a reload

A stateful SDK such as posthog-js, Amplitude, Mixpanel or analytics-next keeps its user in its own storage, so after a reload it can still hold whoever was signed in last time. Trace starts each page load from what your application sets, and it never resets a provider at startup on its own. When your application finds nobody signed in at startup, reset the SDK yourself, before `trace.start()`:

```ts
import posthogJs from "posthog-js";

const session = await restoreSession();

if (session === null) {
  posthogJs.reset();
} else {
  trace.user(session.user);
}

trace.start();
```

Resetting before `start()` lets Trace apply consent after the reset, which matters for PostHog, whose reset returns consent to its configured default. A reset also starts a new anonymous id, so an application that can tell an ended session from a visitor who never signed in resets only for the first.

## Traits

`trace.traits()` merges traits into the current user, or into the anonymous visitor before a sign-in. A `null` removes a trait:

```ts
trace.traits({ plan: "team", role: null });
```

With `schema.traits`, the traits are typed and each value is validated when it is set:

```ts
import { Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";
import { z } from "zod";

const trace = new Trace({
  events,
  destinations: { console: console() },
  schema: {
    traits: { plan: z.enum(["free", "pro", "team"]), seats: z.number().int() },
  },
});

trace.user({ id: "user_42", traits: { plan: "pro", seats: 3 } });
```

- An invalid value, or a key the schema does not declare, costs only itself: the rest of the call applies, and the diagnostic `traits refused` names its path, such as `traits.seats`.
- Traits that are not an object are refused as a whole. A `user()` call carrying them still signs the user in.
- Traits are sanitized when they are set, so a trait that `redact` names never reaches a provider, and neither does its removal. See [privacy and redaction](privacy.md).

## On a server

A server handles many users at once, so it builds one Trace per request or job, which never holds more than that request's user: construct it, `start()`, `user()`, track, `await trace.flush()`, then `dispose()`. See [servers and serverless](servers.md).
