---
description: "Reach the provider SDK behind a Trace destination for what an adapter does not wrap, through trace.destination(name), and what stops applying when you do."
---

# Native provider access

Trace maps one sanitized event onto one provider and nothing more. For everything else a provider offers, such as feature flags, revenue tracking or reading a client id, use the SDK directly. `trace.destination(name)` gives it to you, typed as the SDK you passed in.

```ts
const research = trace.destination("research");

research.status.get(); // { state: "ready" }
research.native?.reloadFeatureFlags(); // the posthog-js instance itself
```

`native` is `null` until the destination is ready, and `null` again once it fails or the Trace is disposed. Reading it is passive: it starts nothing and reports nothing.

| Destination                              | `native` is                                            |
| ---------------------------------------- | ------------------------------------------------------ |
| Amplitude, Ampli                         | the SDK or `ampli` object you passed                   |
| PostHog (browser, React Native, server)  | the client you passed                                  |
| Mixpanel (browser, React Native, server) | the SDK or client you passed                           |
| Segment, RudderStack                     | the `Analytics` or `RudderAnalytics` client you passed |
| Google Analytics                         | the `gtag` function you passed                         |
| Firebase (web, React Native)             | the `Analytics` instance you passed                    |
| Heap                                     | the `sdk` you passed                                   |
| Plausible, Umami, Fathom, Vercel         | the `sdk` you passed                                   |
| Console                                  | the writer function                                    |
| HTTP                                     | the `request` function you passed                      |

The name is typed: a destination that was not configured is a compile error, and at runtime `trace.destination` throws a `TraceError` with the code `INVALID_CONFIGURATION`, because it names a programming mistake, not a delivery failure.

## What stops applying

Anything you do through `native` goes straight to the provider. It bypasses:

- **Redaction and sanitizing.** What you pass is sent as it is.
- **Identity isolation.** A property registered on the SDK's own global state stays there across an account switch and can appear on the next user's data.
- **Routing and receipts.** Trace does not know the call happened, so it produces no outcome and no loss.

Trace clears only what Trace wrote. What you set through `native` is yours to clear, for example at `reset`.

## Watching a destination

`status` is observable, which is what every binding's `useDestinationStatus` uses; the [devtools](devtools.md) read `trace.diagnostics` instead.

```ts
const { status } = trace.destination("research");

const unsubscribe = status.subscribe(() => {
  console.log(status.get().state);
});
```

The states are `idle`, `ready`, `failed` with the error its adapter's `open` threw, and `disposed`. Every shipped adapter throws a `TraceError` whose `code` is `NOT_INITIALIZED` or `UNSUPPORTED`, so you can branch on it:

```ts
import { TraceError } from "@priemskiyyy/trace";

const current = trace.destination("research").status.get();

if (current.state === "failed" && current.error instanceof TraceError) {
  console.warn(current.error.code, current.error.message);
}
```

See [choose an adapter](adapters.md) for what each adapter's `native` type is built from, and [configuration](configuration.md) for the constructor refusals `trace.destination` shares its error code with.
