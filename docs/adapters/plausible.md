---
description: "Plausible custom events: flat props as text, no identifiers at all, and evidence from Plausible's own callback."
---

# Plausible

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-plausible @plausible-analytics/tracker
```

```ts
import { init, track } from "@plausible-analytics/tracker";
import { event, Trace } from "@priemskiyyy/trace";
import { plausible } from "@priemskiyyy/trace-plausible";

init({ domain: "example.com" });

const trace = new Trace({
  events: { "Signup Completed": event<{ plan: string; seats: number }>() },
  destinations: { site: plausible({ sdk: { track } }) },
});

trace.start();
trace.track("Signup Completed", { plan: "pro", seats: 3 });
```

Plausible shows a custom event once a goal with its name exists in the site's settings.

| Option | Default  | Meaning                                                                                                          |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The tracker your application initialized: `{ track }` from `@plausible-analytics/tracker`, or the module itself. |

## How events are mapped

Each event is one `track(name, { props, callback })` call. Context goes under `props`, a property winning where it shadows a context key. Plausible's props take scalars only: numbers and booleans are sent as text (`coerced`), objects, arrays and `null` are left out (`unsupported`). Plausible keeps the first 30 props, `truncated` for the rest; a prop name over 300 characters is left out whole, `invalid`; a prop value over 2000 characters is cut to fit, `truncated`. Neither an id nor a timestamp is sent: Plausible has no deduplication and stamps the event when its request arrives.

## Identity

There is none. The session has no `identify`, `traits`, `group` or `reset`, so no user, trait or group ever reaches Plausible, which forbids identifiers in its terms. Plausible tells visitors apart by a daily hash of the IP address and user agent instead.

## Consent

The tracker's only switch, the `plausible_ignore` flag, is documented for excluding your own visits, not for consent, so this session has no `collection`. Trace's own gating still holds. Call `init` only once consent is granted, or initialize with `autoCapturePageviews: false` and leave the tracker's other automatic tracking off.

## Behavior

- Evidence is `sdk-callback-completed`: the adapter waits for Plausible's own callback, bounded by the Trace's `timeout`, and a 2xx status is what it reports. Plausible answers 202 to an event it silently drops too, such as a bot's, so nothing stronger is claimed.
- No flush; each event is its own `keepalive` request.
- `native` is the `sdk` you passed in.

See [provider limitations](../provider-limitations.md) for every documented limit, and [choose an adapter](../adapters.md) for how Plausible compares to the rest.
