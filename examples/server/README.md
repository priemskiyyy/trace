# Boutique's events, received by a server

A Node server for `POST /api/events`, the shape [`@priemskiyyy/trace-http`](../../packages/adapters/http)
sends over the wire: `id`, `name`, `properties`, `context`, `identity` and
`timestamp`, as `JSON.stringify(event)` would produce it in a browser, Expo
or another server. Node's own `http`, no framework.

```sh
pnpm install
pnpm --filter example-server dev
```

`dev` builds the server with Vite's SSR build and runs the bundle, as
Switchboard's does, so the `src/*` imports every file uses resolve the same
way they do under Vitest.

The boundary file is `src/forwardTrackedEvent.ts`: everything above it is the
request's own JSON, checked only by `src/requests.ts`'s Zod schema, and
everything it constructs is real Trace and adapter code. Each request builds
its own `Trace` over two simulated node clients, applies the identity the
event was accepted with (`trace.user`, then `trace.group` per membership),
tracks the event, flushes and disposes, so one visitor's request can never
carry into another's.

## How it fits together

| File                                                                                 | Role                                                                                               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/requests.ts`                                                                    | `trackedEventSchema`, the Zod envelope every request body must satisfy, and a bounded body reader. |
| `src/forwardTrackedEvent.ts`                                                         | The boundary file: one Trace per request, over `posthog()` and `segment()`, node-flavored.         |
| `src/createEventsServer.ts`                                                          | Routes `POST /api/events`, answers 400 on a malformed body and 404 elsewhere.                      |
| `src/main.ts`                                                                        | Listens on `PORT`, 4319 by default.                                                                |
| `../shared/simulated/createSimulatedPostHogNode.ts`, `createSimulatedSegmentNode.ts` | The two provider clients, recording every call in memory instead of a network request.             |

Neither node destination carries a visitor id over the wire (the HTTP
destination's contract has none), so a request whose event has no signed-in
user is `skipped: unidentified` by both, exactly as `posthog-node`'s and
`segment-node`'s own READMEs describe for a call with neither a user nor an
anonymous id. `segment()` opens with no `group` option, since a generic relay
cannot know which one Trace group type stands for Segment's one group; a
membership still reaches PostHog through `groupIdentify`.

## Tests

`pnpm vitest run --project example-server` drives the endpoint directly: a
signed-in event with a group reaching both simulated clients under the same
id, an anonymous event skipped by both, a malformed body rejected before any
Trace is built, unknown routes, and an unstarted host's `dispose`.
