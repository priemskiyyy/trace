---
description: "Vercel Web Analytics custom events: two or eight flat properties depending on plan, no context and no identity."
---

# Vercel

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-vercel @vercel/analytics
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { vercel } from "@priemskiyyy/trace-vercel";
import { inject, track } from "@vercel/analytics";

inject();

const trace = new Trace({
  events: { "Signup Completed": event<{ plan: string; seats: number }>() },
  destinations: { site: vercel({ sdk: { track } }) },
});

trace.start();
trace.track("Signup Completed", { plan: "pro", seats: 3 });
```

With a framework, the `<Analytics />` component of `@vercel/analytics` injects the script in place of `inject()`. Custom events need a Pro or Enterprise plan.

| Option              | Default  | Meaning                                                                                                                              |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `sdk`               | required | The browser `track` of `@vercel/analytics`, as `{ track }`, or the module itself.                                                    |
| `limits.properties` | `2`      | The custom properties your plan keeps on one event: `2` on Pro, `8` with Web Analytics Plus or Enterprise. No other number compiles. |

## How events are mapped

Each event is one `track(name, properties)` call, keeping up to `limits.properties` of the event's own properties in order; the rest is `truncated`. Context is never sent, an `omitted` loss on every key, because it would compete with the properties for the plan's few places. An object or array is left out (`unsupported`), since `@vercel/analytics` strips it in production but drops the whole event in development; the adapter leaves it out itself so both environments see the same event. Text is cut at 255 characters, and an event name over 255 is never sent: `dropped: provider-filtered`.

## Identity

There is none. The session has no `identify`, `traits`, `group` or `reset`, so no user, trait or group ever reaches Vercel, which counts visitors by a hash of the request instead.

## Consent

`@vercel/analytics` has no switch Trace could turn, so this session has no `collection`. Trace's own gating still holds. Call `inject` only once consent is granted, or cancel events in your own `beforeSend` while it is not.

## Behavior

- Evidence is `sdk-call-returned`: `track` answers nothing and queues the event until Vercel's script has loaded. Outside a browser, in development, `@vercel/analytics` throws and the event answers `failed`; in production it only warns, and the event still reads `submitted` though nothing was queued. Create this destination in the browser only.
- No flush; Vercel's script sends each event on its own.
- `native` is the `sdk` you passed in.

See [provider limitations](../provider-limitations.md) for every documented limit, and [choose an adapter](../adapters.md) for how Vercel compares to the rest.
