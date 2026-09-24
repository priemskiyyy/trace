---
description: "What the HTTP adapter's request function must do, a reference implementation over fetch, what your endpoint must answer, and how events stay with their own account."
---

# HTTP backend contract

`@priemskiyyy/trace-http` sends each event through a `request` function you write over your own client. It is the only built-in adapter whose evidence rests on your server's answer, so the contract below is what that answer means.

## A reference request

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { http } from "@priemskiyyy/trace-http";

const events = {
  "Checkout Started": event<{ cartId: string; value: number }>(),
};

const trace = new Trace({
  events,
  destinations: {
    backend: http({
      request: async ({ event, signal }) => {
        const response = await fetch("/api/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": event.id,
          },
          body: JSON.stringify(event),
          signal,
          keepalive: true,
        });

        if (!response.ok) {
          throw new Error(`The events endpoint answered ${response.status}.`);
        }
      },
    }),
  },
});
```

Your own API client works the same way: call it, pass `signal`, resolve once the backend accepted the event, and throw when it did not.

## What `request` must do

| `request` does                                              | The receipt says                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| resolves with nothing, once your backend accepted the event | `submitted`, `backend-acknowledged`, `event: null`               |
| resolves with `{ id }`, the backend's reference for it      | `submitted`, `backend-acknowledged`, `event: { id }`             |
| throws or rejects                                           | `failed`, with your error                                        |
| outlives the Trace's `timeout`                              | `indeterminate`: `signal` aborts, and the event may have arrived |

- **Send `event.id` as the idempotency key**, and have the backend answer a repeat with its first result, so an event delivered twice is recorded once.
- **Pass `signal` on**, so a request past the timeout or the Trace's disposal stops.
- **Resolve with `{ id }` only when your backend answered with a string id**, and with nothing otherwise.
- Nothing is lost on the way: the event travels whole, so `losses` on the receipt is only what Trace's own sanitizer removed.

One event is one request. To send batches, batch inside your `request` and resolve each event once its batch is accepted, keeping the window well under the Trace's `timeout`, or its events settle `indeterminate`.

## The body

`JSON.stringify(event)` is the frozen, sanitized event every destination receives: `id`, `name`, `properties`, `context`, `identity` and `timestamp`. The type is exported, so a TypeScript backend can share it:

```ts
import type { TrackedEvent } from "@priemskiyyy/trace";

const handleEvent = (event: TrackedEvent) => {
  console.log(event.name, event.properties);
};
```

## What your endpoint must do

- **Answer with a `2xx` status only once the event is safe.** Your `request` turns that answer into `backend-acknowledged` evidence.
- **Treat the idempotency key as the event's identity.** Store it, and answer a repeat with success without recording the event twice.
- **Optionally return an id**, such as `{ "id": "evt_123" }`, for the receipt's `event.id`.
- **Validate the body.** It comes from a client, so treat it as untrusted input like any other request.

## Events and accounts

Your client authenticates as whoever is signed in when it sends. Trace never hands `request` an identified event whose generation has passed: a switch or sign-out lands the event `identity-changed` first, so your client, authenticating as whoever is signed in now, never sends another account's event. An anonymous event that was waiting at a sign-in is still sent, with `identity.user: null`. If your `request` itself awaits something account-dependent, such as a fresh token, compare `event.identity.user` with your own session before you send.

## What it does not do

There is no retry, no queue, no batching and no offline storage in the adapter: one event is one request, and there is no `flush`, because each event waits for its own. If you need retries, build them into your client, where the idempotency key makes them safe. See [servers and serverless](servers.md) for flushing a per-request Trace, and [receipts and evidence](receipts.md) for what `backend-acknowledged` proves next to the other providers'.
