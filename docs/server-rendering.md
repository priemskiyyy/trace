---
description: "Why constructing a Trace during server rendering is safe, what the four bindings render on the server, and how to flush before a serverless runtime freezes."
---

# Server rendering

## Constructing is inert

No Trace package does anything on import or on construction. `new Trace(...)` allocates plain objects: it opens no destination, starts no timer, touches no global and reads no environment. A module that creates a Trace can be imported by a server render, a test or a build step without effect. Work begins at `start()`, and observing a Trace, through a binding's hooks or the devtools, creates no demand either.

## Whether to start on the server

- **Client only.** Call `start()` from client code. On the server, `track` calls made before then wait in each destination's buffer for `buffer.maxAge`, 30 seconds by default, and are then dropped as `buffer-expired`, which costs a little memory and sends nothing.
- **Server too.** Call `start()` on the server as well, with destinations that make sense there: the HTTP adapter, or a server SDK such as `posthog-node`. See [servers and serverless](servers.md) for one Trace per request.

## Flush before the runtime freezes

A serverless or edge function may be frozen as soon as the response is sent. Flush first, or hand the promise to the platform's `waitUntil`:

```ts
const handleFetch = async (
  request: Request,
  context: { waitUntil: (work: Promise<unknown>) => void },
) => {
  const response = await respond(request);

  context.waitUntil(trace.flush({ timeout: 2000 }));

  return response;
};
```

## Bindings on the server

`TraceProvider` and the four hooks or their equivalents render on the server without effect in every binding: React, Vue, Solid and Svelte. There is no error boundary to differ by framework, unlike a boundary component that catches thrown errors, so the same rule holds everywhere:

- `useTraceStatus` and `useDestinationStatus` read `idle` on the server and during the hydrating render, even when the server-side Trace was already started, because the snapshot for each is an interned constant.
- `useConsent` reads `unknown` for every configured purpose the same way.
- A status only becomes observable once the component has mounted on the client, so server markup and the hydrating render always match.

Each binding's own page ([React](react.md), [Vue](vue.md), [Solid](solid.md), [Svelte](svelte.md)) names the peer range this rests on. React's entries carry a `"use client"` directive, so `TraceProvider` and the hooks can be imported from a React Server Components tree.

## The devtools on the server

Every devtools wrapper ([diagnostics and devtools](devtools.md)) renders an empty host element on the server and subscribes to nothing, the same inertness as the provider, proven by a server-side test for each wrapper.
