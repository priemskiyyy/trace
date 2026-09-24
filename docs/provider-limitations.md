---
description: "What each provider cannot carry: every documented limit an adapter can check, how it is reported on the receipt, and what stays unverified without a real backend."
---

# Provider limitations

Trace does not paper over a provider. When a provider cannot carry part of an event, the adapter sends what it can and lists the rest as a [loss](receipts.md#losses); when it cannot take the event at all, the event is `dropped: provider-filtered` or `skipped: unsupported`. No adapter ever imitates a missing feature by changing provider state around a call, and no adapter cuts an identity value it cannot report a loss for: it leaves the value out whole and throws `UNSUPPORTED` instead.

```ts
const status = await trace.track("Checkout Started", {
  cart: { id: "cart_1" },
  value: 49.5,
  currency: "EUR",
}).settled;

if (status.state === "settled") {
  const outcome = status.outcomes.research;

  if (outcome?.status === "submitted" && outcome.losses.length > 0) {
    console.log(outcome.losses.map(({ path, reason }) => `${path}: ${reason}`));
  }
}
```

A destination whose SDK is not ready yet fails to start with a `TraceError` whose code is `NOT_INITIALIZED`, or `UNSUPPORTED` when the SDK was configured in a way the adapter cannot honor; its events wait in the startup buffer, and `trace.start()` tries again. See [choose an adapter](adapters.md) for the setup of every package named below.

## Amplitude and Ampli

- **Property values and traits are cut at 1,024 characters.** Amplitude cuts what it keeps itself, so a property value is sent whole and `truncated`; a trait it would cut is left out whole instead, because an identity step has no receipt to name a partial cut on.
- **Nesting past 40 layers is left out**, `unsupported`, on events and on traits alike.
- **A user or device id under 5 characters is not checked.** `init`'s `minIdLength` can lower Amplitude's own minimum, so the adapters send ids as given.
- **The identity plugin must stay added.** Amplitude removes it on `remove()` and on a later `init()`; until it is added again, every call, including a sign-in, fails with `NOT_INITIALIZED` rather than going out under whichever user Amplitude would otherwise fill in.
- **`fromAmpli`'s group step does not exist.** The generated wrapper has no group call, so `trace-ampli` sessions plan none.
- **The server package is stateless.** `trace-amplitude-node` has no `identify` and no `reset`: every call carries its own `user_id` and `device_id`.

## PostHog

- **Placeholder and over-long distinct ids are refused.** `anonymous`, `guest` and the rest never reach PostHog and are reported as an unsupported step; an id over 200 characters (or posthog-js's own shorter cut) fails the step outright, and the user's events are skipped as `identity-failed`, because two users sharing the kept prefix would share one person.
- **Every `$`-prefixed name, `distinct_id` and `token` are removed from properties**, `omitted`, because posthog-js merges them over its own state.
- **String values are cut wherever posthog-js is configured to cut them** (`properties_string_max_length`, 65,535 by default); a person or group property past the limit is left out whole rather than sent cut.
- **The cookieless web modes cannot be gated** and fail the start with `UNSUPPORTED`, because they ignore opt-out and rotate identity on their own.
- **The server package keeps `identify` but not `reset`.** posthog-node holds no person between calls, but a sign-in still merges the visitor's history through `$identify`.

## Mixpanel

- **An event older than five days, judged on the Trace's own clock, is never sent**, `dropped: provider-filtered`.
- **255 properties, 255 keys per object, 255 items per list, 3 levels of nesting.** Past each, the adapter keeps what fits and reports the rest `truncated` or `unsupported`.
- **Every string is cut at 255 characters**, sent whole for Mixpanel to cut, `truncated`.
- **The `$` and `mp_` prefixes, `time`, `distinct_id`, `token`, `ip`, `alias` and `bucket` are reserved**, `omitted`, so an event can neither move to another person nor change its own time.
- **A user id, group type or group id over 255 characters is never sent**: `identify` fails outright, and a group step throws `UNSUPPORTED`, because Mixpanel would cut it and merge two profiles that share the kept prefix.
- **The React Native package needs `TextEncoder`** (Hermes, React Native 0.74 or later) and should run in native mode, not JavaScript mode, where accounts switch on one device.
- **The server package has no `identify` and no `reset`.** Every call and every update names its own `$user_id`.

## Segment and RudderStack

- **An event past 32,768 bytes of UTF-8 JSON (name and properties, a lower bound) is never sent**, `dropped: provider-filtered`, the limit both document.
- **Segment keeps one group with no type of its own.** Without the `group: { type }` option, these sessions have no `group` method at all; a membership of any other type is reported as an unsupported step.
- **An anonymous event can be filed under whoever signs in while it is still in Segment's browser pipeline.** analytics-next stamps the user when it _sends_, not when `track` was called, and its retry queue and offline buffer stretch that window to minutes; load with `retryQueue: false` on a shared device to leave only the tick.
- **RudderStack drops every `null` it sends, at any depth.** A trait removal, or an object or list trait, cannot reach RudderStack as asked: the adapter leaves such a trait out and throws `UNSUPPORTED` rather than let a stale value stay on the profile.
- **The Node and React Native Segment packages need identity on every call**, because analytics-node throws without a `userId` or `anonymousId`; without either, the event is `skipped: unidentified` before the SDK sees it.

## Google Analytics and Firebase

- **An event name that breaks GA4's naming rule, or one GA4 reserves, is never sent**, `dropped: provider-filtered`.
- **25 parameters per event, 100 characters per value (300 to 1000 for a few Google-recognized ones), 200 items, 27 custom item parameters.** Past each, the adapter cuts or drops and reports it.
- **A field gtag.js reads as its own instead of an event parameter is `omitted`**, including every field that would move, redirect or reconfigure the event, such as `client_id`, `transport_url` and `user_id`.
- **A nested value is always `unsupported`.** GA4 parameters are flat; keep context meant for GA4 flat too, such as `app_version` rather than `app: { version }`.
- **A user id over 256 characters, or a user property GA4 would ignore (a reserved name, over 36 characters, nested), is reported as an unsupported step and never sent**, because GA4 ignores such a change rather than keeping part of it.
- **There are no groups.** GA4 has no group analytics.
- **React Native Firebase coerces seven parameter names to whole numbers and `success` to `1` or `0`**, `coerced`; text or `null` under `extend_session` is left out, `invalid`, because the native bridge would fail the event.

## Heap

- **A property name of 512 characters or more is dropped**, `invalid`; text is cut at 1024, `truncated`.
- **heap.js has no notion of a blank or nested value.** An empty string, `null`, an object or a mixed array is left out, `unsupported`; booleans and scalar arrays are sent as text, `coerced`.
- **A placeholder or over-long identity fails outright, not just unsupported.** Heap would file that user's events under its anonymous user, which `resetIdentity` cannot undo, so the user's events are skipped as `identity-failed`.
- **There are no groups.** Heap's browser API has none, and there is no consent switch: `stopTracking` cannot be undone without a reload.

## Plausible

- **Props take scalars only.** Numbers and booleans become text, `coerced`; objects, arrays and `null` are `unsupported`.
- **30 props per event, 300-character names, 2000-character values.** Past each, the adapter drops or cuts.
- **There is no identity at all.** Plausible forbids identifiers in its own terms.

## Umami

- **Event names are cut at 50 characters, text at 500, numbers to four decimal places.** All `truncated`. `null` and arrays are stored as JSON text, `coerced`; an array whose JSON text passes 500 characters is dropped, `invalid`.
- **A user id over 50 characters is left out of the event**, `invalid`, rather than sent for Umami to cut.
- **Identity travels on the event, not the session.** There is no `identify`, so a distinct id set through `native` is separate from what an event carries.

## Fathom

- **Every property and context key is `unsupported`.** Fathom keeps only a name and, optionally, a value in whole cents.
- **A `value()` answer that is not a whole number of cents is left out**, `invalid`, and never rounded.
- **There is no identity at all**, and none may be folded into a name or value, which breaches Fathom's terms.

## Vercel

- **Two properties per event on Pro, eight with Web Analytics Plus or Enterprise.** The rest is `truncated`.
- **Context is never sent.** Every context key is `omitted`, because it would compete with properties for the plan's few places.
- **Objects and arrays are left out**, `unsupported`, in both development and production, so the event looks the same in each.
- **There is no identity at all.** Vercel counts visitors by a hash of the request.

## Console and HTTP

Neither has a provider to cut anything. The console prints the frozen event whole, so `losses` is always empty; the HTTP adapter sends `JSON.stringify(event)` as it is, so its `losses` is only what Trace's own sanitizer removed before the adapter ever saw the event. See the [HTTP backend contract](http-backend.md) for what your own endpoint must do instead.

## Not verified without a real backend

Every limit above was checked against what each provider documents, and against the SDK's own source where its behavior is not documented. None of it is a run against the provider's live servers: what a provider's backend keeps, merges, deduplicates or refuses past a documented limit is outside what a client-side adapter can observe. See the [verification matrix](verification.md) for exactly what was proven against a fake, against the real SDK, and never at all.

## What no adapter can do

- Tell you that a provider's own filter discarded an event, unless the SDK says so on the call that queued it.
- Confirm that a provider stored, processed or displayed an event; every evidence value is bounded by what the SDK or your backend proves, never more. See [receipts and evidence](receipts.md#evidence).
- Merge, deduplicate or reconcile identities on the provider's servers. An adapter reports what it sent and what it could not; what a provider's identity resolution does with it is the provider's own rule.
- Apply Trace's redaction to a provider's own autocapture, session replay or automatic instrumentation, which runs outside Trace entirely.
