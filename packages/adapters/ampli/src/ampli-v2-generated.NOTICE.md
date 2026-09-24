# About `ampli-v2-generated.ts`

`ampli-v2-generated.ts` is a real generated Ampli wrapper, copied byte for byte
from [`amplitude/ampli-examples`](https://github.com/amplitude/ampli-examples),
`browser/typescript/v2/react-app/src/ampli/index.ts`, which is MIT licensed by
Amplitude, Inc. Its own header is part of that copy and stays with it.

It is a test fixture and nothing else: no source file imports it, it is never
edited, and it is excluded from eslint and prettier because it is generated
output with its own formatting and its own parameter properties. `tsc` does
compile it, because `ampli.contracts.ts` pins the structural types this package
is written against to the classes in this file. A drift between a real Ampli
wrapper and those types is meant to fail the type check.

It compiles against `@amplitude/analytics-browser`, a root dev dependency used
only by tests and type contracts. The wrapper's header names `^1.3.0`; the
version this repository checks it against is pinned in the root `package.json`.
