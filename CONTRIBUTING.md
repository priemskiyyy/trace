# Contributing

Use Node 22.18 or newer and the pnpm version in `package.json`. Run `pnpm install --frozen-lockfile`, then `pnpm check` before submitting a change, and read its output. `pnpm check` builds every package, then runs TypeScript, ESLint, the lint-rule probes, Prettier and the unit tests.

## Layout

- `packages/core`: the runtime, published as `@priemskiyyy/trace` with the `./mock` and `./testing` subpaths.
- `packages/adapters/*`: one package per provider SDK API, published as `@priemskiyyy/trace-<name>`. A React Native or Node SDK with a different API gets its own package whose factory keeps the provider's name; Amplitude's browser and React Native SDKs share their API, so one package serves both. Packages share nothing privately.
- `packages/react`, `packages/vue`, `packages/solid`, `packages/svelte`: the bindings, one surface in each framework's own idiom.
- `packages/devtools`: the in-page inspector, with one thin wrapper per binding.
- `examples/*`: Boutique, one small shop for every binding, plus Expo and a Node server.
- `docs/`: the VitePress site.
- `scripts/`: the repository checks. `verify-lint-rules.mjs` lints probes with the real ESLint config and proves every rule in both directions.

Runtime owners and helpers live in `src/utils/`, shared helpers in `src/utils/common/`, constants in `src/utils/constants/<topic>.ts` as UPPER_SNAKE values, and public types in `src/types/`, one type per file. Internal contracts belong in each folder's `internal/` directory, so `src/types/internal/` holds the types no consumer sees and `src/utils/internal/<topic>/` the machinery no consumer may import. The core's mock adapter lives in `src/mock/` and its conformance suite in `src/testing/`. Typecheck-only expectations sit beside their sources as `*.contracts.ts`, and `tests/types/` holds the consumer-view type tests that the root `tsc` checks.

Package roots export the supported public API explicitly, one export per file and no `export *`, and no other file is a barrel. The entry points are `src/index.ts`, the core's `src/mock.ts` and `src/testing.ts`, and the devtools wrappers `react`, `vue`, `solid` and `svelte`. `src/index.test.ts` pins each entry's runtime names with `Object.keys`.

Every `exports` entry is `types`, then `import`, then `default`, with `import` and `default` on the same ESM file, because React Native consumers run Jest, which needs a resolvable condition. The Svelte binding alone uses `types` then `svelte`. Every package is version `0.1.0` under the MIT license, and the core has zero runtime dependencies.

## Code

ESLint enforces every rule it can check, and `pnpm test:lint` proves each one with a probe it must reject and, where a rule has exceptions, one it must allow. Change a rule and its probes together.

- **ESLint** (Switchboard's banned syntax with Flare's re-export and Svelte blocks): `type` over `interface`, no `enum`, `switch`, `any`, `as` (including `as const`), angle-bracket assertions, non-null `!`, `void` operator, `??=`, `||=`, `&&=`, `readonly` in any form (`Readonly<>`, `readonly T[]`, readonly fields and mapped modifiers), `export *`, relative imports, or re-exports outside `index.ts`, `mock.ts` and `testing.ts`; `curly: all`; `no-else-return`; `consistent-type-imports`; and the blank-line rule:

  ```js
  "padding-line-between-statements": [
    "error",
    { blankLine: "always", prev: "*", next: ["const", "let"] },
    { blankLine: "always", prev: ["const", "let"], next: "*" },
    { blankLine: "any", prev: ["singleline-const", "singleline-let"], next: ["singleline-const", "singleline-let"] },
    { blankLine: "always", prev: "*", next: "block-like" },
    { blankLine: "always", prev: "block-like", next: "*" },
    { blankLine: "always", prev: "*", next: "return" },
  ],
  ```

  Every restriction carries a message naming the alternative. `react-hooks` recommended rules on React files; Vue and Svelte plugins on theirs.

- **Comments**: none, except a provider quirk or a workaround the code cannot say, in one line. No narration, no design-log references (no "Amendment", "G12", "decision D3" in code). Public exports (the runtime values each entry point exports, the members of `Trace`, adapter factories, binding components and hooks, the devtools class, and every type an entry point exports) carry a JSDoc of one or two sentences and an `@example`, as Flare's and Scout's do; a field of a public type whose contract its name cannot say carries a one-line JSDoc. A constant in `utils/constants/` carries a one-line JSDoc naming the fact it encodes, as Flare's do. Other internal types, internals and tests carry none. A test's `@ts-expect-error` states its reason.
- **Code**: early returns and no `else` after a return; `typeof x === "function"` guards; exhaustive union dispatch closed by `assertUnreachable`, or a `satisfies Record<...>` table for a pure mapping; helpers named for what they return (`getEventLosses`), a one-line helper with one caller inlined; handlers named `handle*`; arrow functions exported one per file; classes only for stateful owners, with `#private` fields, public members as arrow fields and private helpers as `#method()`; no default exports; no module-level mutable state; no `process.env`; `src/...` imports inside a package; grouped options; published data frozen at runtime; one `.flatMap()` with early returns (`return []` to skip, `return [value]` to keep) instead of `.filter().map()` or `.map().filter()`. No generic guard helpers (`isRecord`, `isThenable`, `isPromiseLike`, `isObject` and the like): they claim a type they cannot prove. Trust the declared type where the type is the contract (options, adapter answers, SDK returns, schema results), and contain the failure when a caller breaks it (the read sits inside a `try`). Where a genuine runtime boundary needs a check, write the precise one the case needs: `isPlainObject` for data being sanitized, a comparison on the discriminant, `Array.isArray`, or assimilating a possible promise through `new Promise((resolve) => resolve(value))` inside a `try`.
- **Data**: a lifecycle discriminates on `state`, an answer or outcome on `status`, a payload on `kind`. Public discriminant and reason values are lowercase, multiword ones kebab. Internal state machines use `UPPER_CASE` states. Error codes are UPPER_SNAKE. Published data uses `T | null` for an absent value; inputs use optional fields. Identifiers live in their object: `event: { id }`, `user: { id }`, `group: { type, id }`, `destination: { name }`, `adapter: { name }`. Time is a `number` of epoch milliseconds named `timestamp`. Durations are milliseconds with no suffix. Published data is frozen at runtime. Types carry no `readonly`.
- **Tests**: `<Source>.test.ts` beside the source, flat `test()` calls named as the invariant they guard, `globals: false`, no `describe` outside the conformance suite, assertions on specific values and call arguments, fake timers only for time-based rules with `vi.useRealTimers()` in `afterEach`, interleaving by reentrancy and held mock calls, never by sleeping. A new test is watched failing before it is trusted.
- **Prose**: use concise sentences and plain punctuation.
- **Carve-outs**, each with a one-line comment and nothing wider: the overload pair `resolveDestination` behind `Trace.destination`, as Scout's `resolveIndex` (no `as` and no ESLint disable anywhere), and the ones behind `fromAmpli` and each `ga4`; method syntax on `EventDefinition.parse` and on `*Like` members that need bivariance; the overloaded `function` signatures of `event`; the `Register` interfaces; relative imports in the Svelte binding; the one `describe` in `testAnalyticsAdapter`; the two `Object.create(null)` records, a receipt's outcomes and a flush result's destinations, so a destination named `__proto__` stays an own key.

Trace is a best-effort feature of its host application. It never throws into the host at runtime. The only throws are `TraceError` `INVALID_CONFIGURATION` from the constructor, `destination()` for an unknown name, a binding hook outside its provider, `fromAmpli` with a mismatched name, and mounting the devtools twice. Every adapter call, sanitizer and user callback is contained, and a failure becomes a receipt outcome or a diagnostic.

## Adapters

An adapter is a plain `{ name, open }`, and `open` returns a session. It maps one sanitized event onto one provider and nothing more. The rules:

1. **The factory is cold.** Creating the adapter reads nothing, opens nothing, sends nothing. It may run at module scope on a server.
2. **Take the SDK the application set up.** The option is `sdk`, typed structurally as `<Name>Like` naming only what the adapter calls. Never import the provider at runtime, never initialize or close it. A typecheck-only `<name>.contracts.ts` assigns the real SDK to the structural type, proves `native` keeps the real type, and refuses a wrong object and the other platform's SDK with `@ts-expect-error`.
3. **`open` succeeds or throws before changing anything**, with `TraceError` `NOT_INITIALIZED` when the SDK is not ready yet (the application initializes it and calls `start()` again) or `UNSUPPORTED` when it was configured in a way the adapter cannot honor.
4. **A session implements an identity method only for something its provider can do with it**: a browser or mobile SDK switches its own identity; a server SDK updates the profile of the `user` each update names. An event's identity on a per-call provider is read from `event.identity` in `track`. A session without `reset` is never reset, which is right for an SDK that holds no one between calls.
5. **Never write an event to provider globals.** No super properties registered from `track`.
6. **Pass what the provider can keep:** `event.id` as its dedup id and `event.timestamp` as its event time where it takes them. Where it cannot keep the time, report `{ path: "timestamp", reason: "unsupported" }`.
7. **Context goes under properties**, properties winning. A context key a property shadows is an `omitted` loss.
8. **Say what the provider cannot carry**: a loss per path, `skipped: unsupported` for an event the provider has no notion of. Never move identity into properties to compensate.
9. **Answer, do not throw.** When an SDK swallows its own error, answer `failed` with `TraceError` `DELIVERY_FAILED`. An identity method that cannot do this particular update throws `TraceError` `UNSUPPORTED`, which counts as done for `identify`, `traits` and `group`; an adapter whose SDK cannot reset omits `reset` instead, because a `reset` that throws, `UNSUPPORTED` included, leaves the applied state unknown.
10. **Evidence is the weakest the SDK proves.**
11. **`collection` only for a reversible, non-destructive switch.** A switch that deletes a profile or cannot be turned back on is left out and the README says why.
12. **When `track` awaits anything account-dependent**, compare `context.currentGeneration()` with `event.identity.generation` and answer `skipped: auth-subject-mismatch` when an identified event's generation has passed.
13. **Methods of `<Name>Like` use property syntax.** Method syntax only on a member that needs parameter bivariance, with the one-line reason "A method, so that ..." (Flare's practice).
14. **Time comes from the context.** An adapter never reads the wall clock: `context.now()` is the Trace's clock (the `now` option, guarded), so an age rule such as Mixpanel's five days runs on the same clock the event was stamped with and on a test's clock.
15. **Types before runtime checks.** What the types can enforce is not checked again at runtime: required options are non-optional, a mapping is typed from the registry, a value's shape is its type, and an adapter never validates its own options. Runtime code handles only what arrives at runtime (event data, the provider's answers, the SDK's state) and does only the work the provider needs: no conversion the application did not ask for, no copy of what the core or the SDK already does, no helper for a case the types rule out.
16. **Text over a provider's limit.** Where the provider cuts over-long text itself, the adapter reports `truncated` and lets it cut. Where the provider refuses over-long text rather than cutting it, the adapter cuts the text to fit only where a loss can name the path (event properties and parameters, `truncated`). Where no loss can name it (identity updates), a value any part of which the provider would cut or refuse is left out whole and the step throws `UNSUPPORTED`, so no stored profile value is ever altered silently or partly.
17. **Loss order.** An adapter reports its losses in the order of the event's shape: the name first, then properties, then context, then anything else (timestamp, identity), so receipts read the same for every provider.
18. **Every documented limit.** Each limit the provider documents that the adapter can check locally is enforced, measured in the provider's own unit, and reported as a loss or a refusal; the README's limits table cites each source. Server-side behavior the adapter cannot check is listed as not verified.
19. **Loss vocabulary.** `invalid`: a value or name that breaks a documented provider rule (a size, length, character or reserved-name limit), left out or dropped; `truncated`: cut, by the adapter or the provider; `unsupported`: the provider has no notion of it (a nested value, a type, a feature); `omitted`: removed because it would change the provider's own behavior (a control key) or a property shadows it; `coerced`: converted to a type the provider takes; `redacted`: removed by the privacy rule.
20. **An identity the provider refuses is a failure** when sending anyway would file that user's events under someone else (Heap merges its anonymous history into the next user): `identify` throws a failure such as `DELIVERY_FAILED`, never `UNSUPPORTED`, so the lane skips the events as `identity-failed`.

Every adapter package has this layout:

```text
packages/adapters/<name>/
  LICENSE  README.md  package.json  tsconfig.json  tsdown.config.ts
  src/index.ts                     the factory and the public types, nothing else
  src/<name>.ts                    the factory alone; every helper with logic lives in src/utils/
  src/<name>.test.ts               mapping, identity, consent, losses, coldness, native
  src/<name>.contracts.ts          typecheck only, against the real SDK
  src/<name>.sdk.test.ts           the real SDK in Node or jsdom, where it runs there
  src/conformance.test.ts          testAnalyticsAdapter, once per configuration
  src/index.test.ts                expect(Object.keys(api)).toEqual([...])
  src/fake<Sdk>.fixture.ts         in-process fake modelled on a named SDK version
  src/types/<Name>AdapterOptions.ts
  src/types/<Name>Like.ts
  src/utils/constants/<topic>.ts   every provider name, reserved key, limit and fixed option object, UPPER_SNAKE (none when the adapter has none, as http),
                                   each with a one-line JSDoc naming the provider fact it encodes
  src/utils/<helper>.ts            one arrow per file, named for what it returns or does (getPostHogProperties,
                                   applyTraits, createProcessingBarrier, isReservedKey), with its test beside it
  src/utils/assertUnreachable.ts   a local copy where the adapter dispatches on a union, as Flare's adapters do
```

Its `package.json` has no `dependencies`: the core is a peer at `>=0.1.0 <0.2` plus a `workspace:*` dev dependency, and the provider SDKs are optional peers, pinned exactly only as root dev dependencies. It sets `sideEffects: false`, the description "<Provider> destination for Trace: <what one event becomes>, over the <sdk> you inject.", and the keywords provider, category, platform, then `typescript`, `trace`, `adapter`. Its README has, in order: `# @priemskiyyy/trace-<name>`, one paragraph, Installation, Create a Trace, Options (table), How an event is mapped (table), Identity, Consent, Behavior (bullets: platforms and versions, initialization, evidence, flush, quirks, `native`), Tests (what ran and what did not), License.

## Testing

`pnpm test:unit` runs one Vitest project per package, each with a `src` alias onto its own source. Every folder under `packages/adapters` with a `package.json` is a project without being listed. Adapter tests import the core by its package name, so run `pnpm build` first.

A new test is watched failing once before it is trusted. When the implementation came first, break it on purpose and confirm the test goes red. A bare `toHaveBeenCalled()` is not an assertion; assert the calls with their arguments. A `@ts-expect-error <reason>` suppresses only the next line, so on a multi-line literal it sits on the line where the error is reported; TS2578 is a failing negative case, and a negative case counts only when the whole file compiles to exit 0. Assert the property, never a bound on it, and never through a call that returns `any` (`Reflect.apply`, `JSON.parse`): call directly with `@ts-expect-error <reason>`. A fake that does not implement the behavior under test makes that test vacuous.

## Documentation

Use concise prose and conventional commit messages.
