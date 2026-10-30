# @priemskiyyy/trace-http

Send [Trace](../../core) events to your own backend, through your own client. You give the adapter one function that sends an event, and your client keeps everything it already owns: the address, authentication, headers, batching, retries and response handling.

Version 0.1.0 is an initial preview. APIs may change before 1.0. See the [verification limits](https://github.com/priemskiyyy/trace/blob/main/docs/verification.md) before adopting an adapter.

## Installation

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-http
```

## Create a Trace

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
        const response = await fetch("https://api.example.com/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": event.id,
            authorization: `Bearer ${session.token}`,
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

trace.start();
```

## Options

| Option    | Default  | Meaning                                                  |
| --------- | -------- | -------------------------------------------------------- |
| `request` | required | Sends one event through your client, as described below. |

## How an event is mapped

`request({ event, signal })` sends one event and answers for it:

| `request` does                                              | The receipt says                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| resolves with nothing, once your backend accepted the event | `submitted`, `backend-acknowledged`, `event: null`               |
| resolves with `{ id }`, the backend's reference for it      | `submitted`, `backend-acknowledged`, `event: { id }`             |
| throws or rejects                                           | `failed`, with your error                                        |
| outlives `timeout`                                          | `indeterminate`: `signal` aborts, and the event may have arrived |

- `event` is the frozen, sanitized event every destination receives, and `JSON.stringify(event)` is its wire form: `id`, `name`, `properties`, `context`, `identity` and `timestamp`.
- Send `event.id` as the idempotency key, and have the backend answer a repeated key with its first result, so an event that arrives twice is recorded once.
- Pass `signal` on, so a request past the timeout or the Trace's disposal stops.
- Resolve with `{ id }` only when your backend answered with a string id, and with nothing otherwise.
- Nothing is lost on the way: the event travels whole, so the receipt's `losses` are only what Trace's sanitizer removed.

One event is one request. To send batches, batch inside your `request`, and resolve each event once its batch was accepted:

```ts
import type { TrackedEvent } from "@priemskiyyy/trace";
import { http } from "@priemskiyyy/trace-http";

let batch: { events: TrackedEvent[]; sent: Promise<void> } | null = null;

const send = async (events: TrackedEvent[]) => {
  await new Promise((resolve) => setTimeout(resolve, 500));

  batch = null;

  const response = await fetch("https://api.example.com/events/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(events),
  });

  if (!response.ok) {
    throw new Error(`The events endpoint answered ${response.status}.`);
  }
};

const backend = http({
  request: ({ event }) => {
    if (batch === null) {
      const events: TrackedEvent[] = [];

      batch = { events, sent: send(events) };
    }

    batch.events.push(event);

    return batch.sent;
  },
});
```

Every event in a batch shares its answer: each is acknowledged when the batch is, and fails with it. Keep the window well under the Trace's `timeout`, or its events settle `indeterminate`. A batch is sent with the credentials your client holds when it sends, so if your backend authenticates each request as one account, close the batch when `event.identity.generation` changes.

## Identity

Your client authenticates as whoever is signed in when it sends, and each event carries the identity it was tracked with in `event.identity`: the `user` or `null`, the traits, the group memberships and the `generation`. The session has no identity methods: the adapter holds nobody between events, so there is nothing to identify or reset.

- When the user switches accounts or signs out, Trace drops the events the previous user left waiting for this destination as `identity-changed`, so one account's event is never sent with the next account's credentials.
- Trace never hands `request` an identified event whose generation has passed, so the adapter makes no check of its own; a `request` that awaits something account-dependent before it sends, such as a fresh token, compares `event.identity.user` with its own session.
- An anonymous event that was waiting when the user signed in is still sent, with `user: null`.
- The event carries no anonymous or device id. If your backend joins visits together, add the visitor id your application already keeps, such as a cookie, in your client.

## Consent

There is no SDK to initialize opted out and nothing to switch off, so the session has no `collection`. A destination named in `consent` receives nothing while its purposes are not granted: Trace drops its events at acceptance and makes no request for them. Revoking consent drops the events still waiting for this destination; a request already sent is not recalled.

## Behavior

- Platforms: anywhere your client runs, browsers, React Native, Node and edge runtimes alike. There is no SDK and nothing to initialize, so opening never fails.
- Evidence is `backend-acknowledged`. It rests on your `request` resolving only once your backend accepted this exact event: a client that resolves before the answer arrives claims more than it knows.
- An event is sent once: there is no retry, no queue, no timer and no offline storage in the adapter. Retry in your client if you need to; the idempotency key makes that safe.
- There is no `flush`: each event waits for its own request, so `trace.flush()` waits for the requests in flight and reports this destination as `unsupported`.
- Page hide: call `trace.flush({ timeout: 1000 })` when `visibilitychange` reports `hidden`, and send with `keepalive: true` so a request outlives the page. Browsers cap the keepalive bodies in flight at 64 KiB in total, shared with every other script on the page.
- Disposing the Trace aborts `signal` for every request in flight, and those events settle `indeterminate`.
- Privacy: the event was sanitized, redacted and frozen by the core. What your client adds, such as headers, is yours.
- `native` is the `request` you passed.

## Tests

The tests run against an in-process fake client injected through `request`, and through a real `Trace` for what the core decides: the frozen, redacted event each request receives, the receipt for each answer, the timeout and disposal aborting `signal`, no retry, identity across a sign-in and an account switch, and consent. `testAnalyticsAdapter` runs over the fake client. There is no SDK, so there is no contracts file and no real SDK test, and no request is sent over a network from this repository.

## License

[MIT](LICENSE)
