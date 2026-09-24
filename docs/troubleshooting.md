---
description: "Find out why an event did not arrive, why it arrived twice, why metadata is missing, and what each constructor error means."
---

# Troubleshooting

Start with the receipt or the [devtools](devtools.md) timeline. Trace records a reason for every event that does not go out, so there is rarely a need to guess.

```ts
const status = await trace.track("Search Performed", { query: "shoes" })
  .settled;

console.log(status);
```

## An event did not arrive

**The receipt is `dropped`.** The `reason` names the cause:

| Reason             | What to check                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid`          | The event's schema refused its properties (see `issues`), or its name or options could not be used. See [events and schemas](events.md).                          |
| `sanitizer-failed` | Your `privacy.redact` threw, or the scope's context could not be prepared. See [privacy and redaction](privacy.md).                                               |
| `consent`          | Every destination this event could reach was closed by consent. See [consent](consent.md).                                                                        |
| `not-routed`       | Routing selected no destination, or `defaults.to` or the event's own `to` failed. See [routing](routing.md).                                                      |
| `reentrant`        | The call came synchronously from inside an adapter's own call, an `events` listener, or a diagnostics listener. See [where to track](tracking.md#where-to-track). |
| `disposed`         | The Trace was disposed.                                                                                                                                           |

**One destination's outcome is `skipped` with `start-failed`.** Read that destination's status:

```ts
console.log(trace.destination("research").status.get());
// { state: "failed", error: TraceError { code: "NOT_INITIALIZED", ... } }
```

The error is a `TraceError` whose `code` says what to fix: `NOT_INITIALIZED` means the provider SDK was not ready before `trace.start()`, and `UNSUPPORTED` that it was configured in a way the adapter cannot honor, such as PostHog's cookieless mode under consent. Get the SDK ready and call `trace.start()` again: it retries a destination whose start failed, and delivers the events that waited for it within the buffer's bounds.

**The outcome is `dropped` with `buffer-overflow` or `buffer-expired`.** The destination was not ready in time: `buffer.capacity` events already waited (the oldest was dropped to make room), or one waited past `buffer.maxAge`, 30 seconds by default. See [tracking and receipts](tracking.md#before-the-destinations-are-ready).

**The outcome is `dropped` with `identity-changed`.** The user switched or signed out while the event was still waiting for this destination, so it is not sent under the next user. See [users and account switching](users.md).

**The outcome is `indeterminate` with `timeout`.** The provider did not answer within `timeout`, 5000 ms by default. The event may have arrived anyway; do not retry blindly.

**The outcome is `indeterminate` with `disposed` or `ambiguous`.** `disposed` means the Trace was disposed while the provider was still working on the event; `ambiguous` means the adapter itself cannot tell whether its provider took it. Neither proves the event was lost.

**The outcome is `skipped` with `identity-failed`.** An identity step this event needed failed outright, such as Heap refusing a placeholder id or PostHog refusing one it would have to cut, so sending the event risked filing it under the wrong person. That user's events stay skipped until the next successful identity step.

**Every event for one destination is skipped as `identity-failed` at once, after one long wait.** Its SDK never answers, as when a content blocker kept it from loading. An identity step and its retry both outlasted `timeout`, so Trace stopped calling that provider rather than wait `timeout` again for each event, and skips every event that needs an identity step until one of those calls answers, however late. The diagnostic `identity step failed` with the reason `timeout` marks the two calls. Let the SDK load, and the next event or sign-in after its answer plans and delivers again.

**The outcome is `skipped` with `auth-subject-mismatch`.** The adapter had to wait for something account-dependent, and the user changed before it could send.

**The outcome is `skipped` with `unidentified`.** A server adapter had neither a signed-in user nor an `anonymousId` to send the event under. See [servers and serverless](servers.md).

**The outcome is `skipped` with `unsupported`.** The provider has no notion of this event, such as one named like PostHog's own `$identify`. See the provider's page under [Destinations](adapters.md).

**The outcome is `dropped` with `provider-filtered`.** The provider itself declined it: an opted-out SDK, a filter hook, or the event was too old (Mixpanel's five days) or too large. `losses` says what did not fit. See [provider limitations](provider-limitations.md).

**The outcome is `failed`.** The adapter threw, rejected, or answered `failed`, and `error` holds why. A `TraceError` with the code `DELIVERY_FAILED` means the SDK swallowed its own error; one with `INVALID_ANSWER` means the adapter answered with something its contract does not allow.

**The outcome is `submitted`.** Trace handed it over. Check what `evidence` proves (see [receipts and evidence](receipts.md#evidence)), then look in the provider's own tools: its sampling, its own filters and its ingestion are outside Trace.

## Metadata is missing

- **Check `losses` on the outcome.** `invalid` broke a rule, `truncated` was cut, `unsupported` has no notion in the provider, `omitted` was removed for a name the provider owns or a property that shadowed context, and `redacted` was removed by `redact`. See [losses](receipts.md#losses).
- **A value is missing entirely, with no loss to explain it.** `redact` named its key. By default `isSensitiveKey` does, for a key naming a credential: `token`, `authorization`, `password`, `secret`, `cookie`, `credential`, `bearer`, `jwt`, `session_id` and the `api`, `access` or `private` forms of `key`, in any case or separator. See [privacy and redaction](privacy.md).
- **A trait or group trait is missing on later events too.** A change the provider could not apply threw `UNSUPPORTED`: check the diagnostic `identity step unsupported` on that destination, and its page under [Destinations](adapters.md) for what it cannot carry.
- **Context vanished for one event only.** A property of the event shadowed it, an `omitted` loss at that context path. See [context and scopes](context-and-scopes.md).

## An event arrives twice

- **Two destinations over one provider instance.** Nearly every adapter's page says this: register one SDK instance under one destination name. Two destinations wrapping the same `posthog-js`, the same `mixpanel-browser`, the same anything, send every event to the provider twice.
- **Trace and a router both reach the same provider.** Segment and RudderStack are routers: an event sent to them and straight to a provider they also forward to is ingested twice. Send each provider's events through one path.
- **A loop that tracks what it prints.** A `track` made synchronously from inside an adapter's own call, an `events` listener or a diagnostics listener is dropped as `reentrant`, which stops a naive loop after one step, not after zero.

## The constructor throws

Misconfiguration is the one thing Trace throws for, so you find it at startup:

```text
Trace has no destination named "reserach".
```

Every such error is a `TraceError` with the code `INVALID_CONFIGURATION`, and its message names what is wrong: `events` that is not a plain object, `destinations` that is not an object of adapters, `consent` or `defaults.to` naming a destination you never configured, a `consent` entry that is not a list of purpose strings, a `redact` that is not a function, a count or duration outside its bounds, or a `schema` that is present and not an object. See [what the constructor refuses](configuration.md#what-the-constructor-refuses). The bindings throw the same error when a hook is used outside its provider, and the devtools do when `mount()` is called twice.

## Status says `ready`, but nothing arrives

`ready` means the SDK is usable locally, not that a network is reachable or that the provider accepted your key. That is visible only in the provider's own tools, or on a receipt whose evidence is `backend-acknowledged`.
