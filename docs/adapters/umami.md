---
description: "Umami custom events: the user id travels on each event instead of sticking to the page, so an anonymous event never becomes the next user's."
---

# Umami

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-umami
```

Umami's tracker is a script, not an npm package. Load it with `defer` before your application's script, so `window.umami` exists when the Trace is created:

```html
<script
  defer
  src="https://cloud.umami.is/script.js"
  data-website-id="YOUR_WEBSITE_ID"
></script>
<script type="module" src="/src/main.ts"></script>
```

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { umami } from "@priemskiyyy/trace-umami";

const trace = new Trace({
  events: { "Signup Completed": event<{ plan: string; seats: number }>() },
  destinations: { site: umami({ sdk: window.umami }) },
});

trace.start();
trace.user({ id: "user_42" });
trace.track("Signup Completed", { plan: "pro", seats: 3 });
```

| Option | Default  | Meaning                                          |
| ------ | -------- | ------------------------------------------------ |
| `sdk`  | required | `window.umami`, once the tracker script has run. |

## How events are mapped

Each event is one `track` call in its function form, `(payload) => ({ ...payload, name, data, id })`, so the event's own `data` and user id ride over the page's tracker payload rather than sticking to it. Context goes under `data`, a property winning where it shadows a context key. Umami cuts event names at 50 characters and text at 500, rounds numbers to four decimal places, and stores `null` and arrays as JSON text; an array whose JSON text passes 500 characters is dropped. A user id over 50 characters is left out of the event rather than sent for Umami to cut, because two users sharing its kept prefix would become one.

## Identity

There is none: the session has no `identify`, `traits`, `group` or `reset`. Instead, `identity.user` from the event Trace accepted rides on that one event's `id` field, so an event tracked before a sign-in carries none, and one of a signed-out user is never filed under the next signed-in one. Trace never calls `umami.identify`, which would set a distinct id for the whole page with no way to clear it at sign-out.

## Consent

The tracker's only switch, `umami.disabled` in `localStorage`, is documented for excluding your own visits, so this session has no `collection`. Trace's own gating still holds. Add `data-auto-track="false"` to the script tag, or load it only once consent is granted, so nothing collects before then.

## Behavior

- Evidence is `sdk-call-returned`: `track` sends one `keepalive` request per event and resolves after it, a failed one included.
- No flush; each event is its own request.
- `native` is the `sdk` you passed in.

See [provider limitations](../provider-limitations.md) for every documented limit, and [choose an adapter](../adapters.md) for how Umami compares to the rest.
