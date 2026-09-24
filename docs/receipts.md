---
description: "What a Trace receipt tells you about each destination, what every reason and outcome means, how much each piece of evidence proves, and what losses record."
---

# Receipts and evidence

`track()` answers a receipt at once. Most code ignores it. It exists for the moments when you need to know, such as showing a banner when nothing could be sent, or asserting in a test.

```ts
const receipt = trace.track("Search Performed", { query: "shoes" });

receipt.id; // the event's id, also its idempotency key at every destination
receipt.status.get(); // the state right now

const status = await receipt.settled; // never rejects
```

`settled` resolves when the event was dropped, or when every destination it was handed to has an outcome. It never rejects: a provider failure is an outcome, not an exception. `receipt.status.subscribe(listener)` hears each outcome as it lands.

## The three states

| State     | Meaning                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| `dropped` | The event went nowhere, and `reason` says why.                                             |
| `pending` | The event was handed to its destinations. `outcomes` holds `null` for those still working. |
| `settled` | Every destination the event was handed to has an outcome. The first answer stands.         |

A whole event is dropped for one of these reasons:

| Reason             | Why                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid`          | Its declaration refused its properties, listed in `issues`, or its name or its options could not be used. See [events and schemas](events.md).                    |
| `sanitizer-failed` | `redact` threw, or its scope's context could not be prepared, so nothing was sent. See [privacy and redaction](privacy.md).                                       |
| `consent`          | Consent closed every destination it could reach. See [consent](consent.md).                                                                                       |
| `not-routed`       | Routing selected no destination, or failed. See [routing](routing.md).                                                                                            |
| `reentrant`        | It was tracked from inside an adapter's call, an `events` listener or a diagnostics listener, which would loop. See [where to track](tracking.md#where-to-track). |
| `disposed`         | The Trace was disposed.                                                                                                                                           |

A destination that consent had closed when the event was accepted has no slot in `outcomes`: the event was never handed to it.

## Outcomes per destination

```ts
const receipt = trace.track("Search Performed", { query: "shoes" });
const status = await receipt.settled;

if (status.state === "settled") {
  const outcome = status.outcomes.research;

  if (outcome?.status === "submitted") {
    console.log(outcome.evidence, outcome.event?.id, outcome.losses);
  }
}
```

| Status          | Meaning                                                 | Reasons                                                                                             |
| --------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `submitted`     | The destination accepted it, as far as `evidence` goes. |                                                                                                     |
| `dropped`       | Trace or the provider decided not to send it.           | `consent`, `buffer-overflow`, `buffer-expired`, `identity-changed`, `disposed`, `provider-filtered` |
| `skipped`       | This destination could not take this event.             | `start-failed`, `identity-failed`, `auth-subject-mismatch`, `unidentified`, `unsupported`           |
| `failed`        | The attempt failed, and `error` holds why.              |                                                                                                     |
| `indeterminate` | It may or may not have arrived. Do not retry blindly.   | `timeout`, `disposed`, `ambiguous`                                                                  |

| Reason                         | When                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent`                      | A purpose the destination needs was revoked before the hand-off.                                                                                                                        |
| `buffer-overflow`              | The destination's buffer was full, and this was its oldest event.                                                                                                                       |
| `buffer-expired`               | The event waited longer than `buffer.maxAge` for its destination.                                                                                                                       |
| `identity-changed`             | The user switched or signed out while the event waited, so it is not sent under the next user.                                                                                          |
| `disposed`, when dropped       | The Trace was disposed while the event waited.                                                                                                                                          |
| `provider-filtered`            | The provider declined it, for example because its SDK is opted out, a filter hook dropped it, or the event is too old or too large for the provider. Its `losses` say what did not fit. |
| `start-failed`                 | The destination's start failed, and the event outlived `buffer.maxAge` waiting for a successful retry.                                                                                  |
| `identity-failed`              | An identity step the event needed failed, and sending the event could have filed it under the wrong user.                                                                               |
| `auth-subject-mismatch`        | The adapter had to wait for something account-dependent, and the user changed before it could send.                                                                                     |
| `unidentified`                 | A server adapter had neither a user nor an anonymous id to send the event under.                                                                                                        |
| `unsupported`                  | The provider has no notion of this event, such as an event named like PostHog's own `$identify`.                                                                                        |
| `timeout`                      | The provider did not answer within `timeout`, 5000 ms by default.                                                                                                                       |
| `disposed`, when indeterminate | The Trace was disposed while the provider was working on the event.                                                                                                                     |
| `ambiguous`                    | The adapter cannot tell whether its provider took the event.                                                                                                                            |

`indeterminate` is the honest answer when a destination did not respond in time or was disposed mid-flight. The event may already be on its way, so treating it as failed would produce duplicates.

A `failed` outcome's `error` is what the adapter threw, rejected with or answered, exactly as it was. An adapter whose SDK swallows its own errors answers `failed` with a `TraceError` whose code is `DELIVERY_FAILED`. When an adapter answers something its contract does not allow, such as an unknown status, the error is a `TraceError` with the code `INVALID_ANSWER`. An answer is copied field by field before it is published, so nothing an adapter adds beyond its status's own fields ever reaches a receipt.

## Evidence

A `submitted` outcome says on what evidence, weakest first:

| Evidence                 | What it proves                                                                                        | Who gives it                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `sdk-call-returned`      | The SDK call returned without throwing. Nothing more.                                                 | every SDK adapter except Plausible and Mixpanel on a server, and the console |
| `sdk-callback-completed` | The SDK called back to say it finished, which it also does for an event the provider went on to drop. | Plausible, whose callback reports a 2xx answer                               |
| `backend-acknowledged`   | A backend answered for this event.                                                                    | the HTTP adapter, once your `request` resolves, and Mixpanel on a server     |

An event id from an SDK is not proof of delivery, because the SDK creates it before anything leaves the device. Trace reports the provider's reference as `event: { id }`, such as the uuid posthog-js answers or the id your backend returns, or `event: null` when there is none, and claims only what the evidence says. No adapter waits for an upload that can take longer than `timeout` just to claim stronger evidence, and whether the provider then stored or displayed the event is outside what a client library can know. Each adapter's page says what its evidence rests on.

## Losses

A provider that cannot carry part of an event does not fail it. The adapter sends what it can and lists the rest, and Trace adds what its own sanitizer removed, once:

```ts
const receipt = trace.track("Search Performed", { query: "shoes" });
const status = await receipt.settled;
const outcome = status.state === "settled" ? status.outcomes.research : null;

if (outcome?.status === "submitted" && outcome.losses.length > 0) {
  console.log(outcome.losses.map(({ path, reason }) => `${path}: ${reason}`));
}
```

| Reason        | Meaning                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redacted`    | `redact` removed it.                                                                                                                                          |
| `truncated`   | A limit cut it, Trace's own or the provider's.                                                                                                                |
| `invalid`     | It breaks a rule, Trace's own or one the provider documents, and was left out.                                                                                |
| `unsupported` | The provider has no notion of it, such as a nested value, a type or a feature.                                                                                |
| `omitted`     | It was left out because it would change the provider's own behavior, such as a name the provider reserves, or because a property of the same name shadows it. |
| `coerced`     | It was converted to a type the provider takes, such as a `Date` to a string.                                                                                  |

- `submitted` outcomes and `dropped` ones with the reason `provider-filtered` carry losses.
- Trace's own losses come first, then the adapter's, each in the order of the event: the name, the properties, the context, then the rest, such as the timestamp.
- A loss of a trait or a group trait rides on every event that trait would have ridden on, until the trait is removed or the user changes.
- Each part of the event, its properties, its context, the traits and each group type, lists at most `privacy.limits.breadth` losses, 50 by default, and one `truncated` loss at that part, such as `context`, stands for the rest. The adapter's own losses come on top.

See [provider limitations](provider-limitations.md) for what each provider cannot carry.

## Before start

A destination that is not ready holds its events in a buffer: 100 events for up to 30 seconds by default. When it is full, the oldest event is dropped as `buffer-overflow` and the diagnostic `buffer overflow` is recorded. One that waits too long is dropped as `buffer-expired`, or skipped as `start-failed` when the destination's start failed and has not succeeded since. Change the bounds with `buffer: { capacity, maxAge }`, with `maxAge` in milliseconds. See [flush and the application lifecycle](flush.md).
