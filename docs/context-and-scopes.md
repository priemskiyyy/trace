---
description: "Give events context with defaults.context, trace.context, a scope and the context of one call, see how the layers combine, and where each provider puts context."
---

# Context and scopes

Context says where an event happened: the application's version, the screen, the flow. Every event carries it in `event.context`, beside its properties.

```ts
import { Trace } from "@priemskiyyy/trace";
import { console } from "@priemskiyyy/trace-console";

const trace = new Trace({
  events,
  destinations: { console: console() },
  defaults: { context: { app: { version: "2.4.0" }, locale: "en" } },
});

trace.start();
trace.context({ screen: "cart", locale: null });

const checkout = trace.scope({ context: { flow: "checkout" } });

checkout.track(
  "Checkout Started",
  { cart: { id: "cart_1" }, value: 49.5, currency: "EUR" },
  { context: { screen: "payment" } },
);
// event.context: { app: { version: "2.4.0" }, screen: "payment", flow: "checkout" }
```

## The layers

| Layer              | Set with                                  | Applies to                             |
| ------------------ | ----------------------------------------- | -------------------------------------- |
| `defaults.context` | the constructor                           | every event                            |
| `trace.context()`  | a call at any time, merged into the above | every event tracked after it           |
| a scope            | `trace.scope({ context })`                | every event tracked through that scope |
| the call           | the `context` option of one `track`       | that event                             |

A later layer wins key by key, in that order. A `null` removes a key: given to `trace.context()`, from every later event, and given to a scope or a call, from the events they track. The context set with `defaults.context` and `trace.context()` survives a change of user, because it describes the application, not the account.

## Sanitized when it is set

`trace.context()` and a scope's context are redacted and bounded when they are set, and a call's context when its event is tracked. Each event's whole context is bounded once more by `privacy.limits`, and whatever that cuts is a `truncated` loss on the receipt. See [privacy and redaction](privacy.md).

What cannot be used costs as little as possible:

| What                               | `trace.context()` | A scope                                                                | A call's `context`                                               |
| ---------------------------------- | ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A value that is not a plain object | changes nothing   | an `invalid` loss at `context` on each event, which is still delivered | an `invalid` loss at `context`, and the event is still delivered |
| A `redact` that throws             | changes nothing   | each event it tracks is dropped as `sanitizer-failed`                  | the event is dropped as `sanitizer-failed`                       |

`defaults.context` is configuration, so the constructor throws `TraceError` `INVALID_CONFIGURATION` for one it cannot use. See [configuration](configuration.md#what-the-constructor-refuses).

## Scopes

A scope is a `track` bound to one more context layer, for a flow, a screen or a unit of work:

```ts
const onboarding = trace.scope({ context: { flow: "onboarding", step: 1 } });

onboarding.track("App Opened");
```

- **It is fixed when it is created.** Its context is copied and sanitized then, so changing the object afterwards changes nothing.
- **It holds no identity.** An event tracked through a scope belongs to whoever is the user when it is tracked, like any other.
- **It does not nest.** A scope has only `track`, so combine contexts yourself when a flow needs two.
- **It does not end.** There is nothing to close and nothing to leak, so create one per flow, per screen or per request.

On a server, prefer a Trace per request to a scope per request, because a scope does not separate users. See [servers and serverless](servers.md).

## Where providers put context

Context travels with the event, and each adapter places it where its provider can keep it:

| Destinations                  | Context goes                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Most adapters                 | into the event's properties, under them: a property of the same name wins, and the context key it shadows is an `omitted` loss at `context.<key>` |
| Google Analytics and Firebase | into the GA4 event's parameters, under the ones your map builds, where a nested value is an `unsupported` loss                                    |
| Fathom                        | nowhere: each key is an `unsupported` loss                                                                                                        |
| Vercel                        | nowhere: each key is an `omitted` loss, because it would take the plan's few property places                                                      |
| HTTP and console              | with the whole event                                                                                                                              |

See [choose an adapter](adapters.md) for each provider's limits.
