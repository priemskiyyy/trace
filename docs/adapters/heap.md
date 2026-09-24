---
description: "Heap in the browser: the object that survives heap.js reloading window.heap, refused placeholder identities, and why there is no consent switch."
---

# Heap

```sh
pnpm add @priemskiyyy/trace @priemskiyyy/trace-heap
```

Heap has no npm package for the browser; load heap.js with Heap's snippet, which calls `heap.load("YOUR_ENVIRONMENT_ID")`. heap.js replaces the snippet's `window.heap` with a new object when it finishes loading, and a call made on the old one afterwards is never sent, so give the adapter an object that reads the current `window.heap` on every call:

```ts
import { event, Trace } from "@priemskiyyy/trace";
import { heap } from "@priemskiyyy/trace-heap";
import type { HeapLike } from "@priemskiyyy/trace-heap";

declare global {
  interface Window {
    heap: HeapLike & { onReady: (callback: () => void) => void };
  }
}

const currentHeap: HeapLike = {
  get loaded() {
    return window.heap.loaded === true;
  },
  track: (name, properties) => window.heap.track(name, properties),
  identify: (identity) => window.heap.identify(identity),
  addUserProperties: (properties) => window.heap.addUserProperties(properties),
  resetIdentity: () => window.heap.resetIdentity(),
};

const trace = new Trace({
  events: {
    "Checkout Started": event<{ cart: { id: string }; value: number }>(),
  },
  destinations: { product: heap({ sdk: currentHeap }) },
});

trace.start();
window.heap.onReady(trace.start);

trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.track("Checkout Started", { cart: { id: "cart_1" }, value: 49.5 });
```

Until heap.js has loaded, the destination's start fails with `NOT_INITIALIZED` and Trace holds events in its buffer; the second `trace.start()`, from `onReady`, opens it and delivers them.

| Option | Default  | Meaning                                                                                                           |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `sdk`  | required | The heap.js global once it has loaded, or an object that reads the current `window.heap` on every call, as above. |

## How events are mapped

Each event is one `track(name, properties)` call; context goes under properties, a property winning where it shadows a context key. heap.js drops a property name of 512 characters or more, or of more than 512 bytes (so a shorter name in multi-byte text can still be dropped), cuts text at 1024 characters, and has no notion of a blank or nested value: an empty string, `null`, an object or a mixed array is `unsupported`. Booleans and arrays of scalars are sent as text (`coerced`); Heap reads numeric text back as a number. An event name over 255 characters, or one of Heap's own (`click`, `change`, `pageview`, `submit`), is never sent and `dropped: provider-filtered`.

## Identity

`identify(user.id)` fails outright, not just unsupported, for an id Heap refuses as a placeholder (`anonymous`, `guest`, `0` and the rest) or one over 255 characters: sending it anyway would file that user's events under Heap's anonymous user, which `resetIdentity` cannot undo, so the user's events are skipped as `identity-failed` instead. Traits are `addUserProperties` with the values Heap keeps (numbers, booleans, text up to 255 characters); a value it would drop or cut is left out, and there is no call that removes a trait. There are no groups: Heap's browser API has none. `reset` calls `resetIdentity()`.

## Consent

Heap has no switch Trace can turn both ways: `stopTracking` cannot be undone without reloading the page, so this session has no `collection`. Trace's own gating still holds: a gated destination receives nothing while its purposes are not granted. Call `heap.load` only once consent is granted, and start Trace from `heap.onReady` after it, so nothing collects before then.

## Behavior

- Evidence is `sdk-call-returned`: every heap.js call answers nothing, and heap.js batches and uploads on its own.
- No flush; `trace.flush()` reports this destination `unsupported`.
- `native` is the `sdk` you passed in.

See [provider limitations](../provider-limitations.md) for every documented limit, and [choose an adapter](../adapters.md) for how Heap compares to the rest.
