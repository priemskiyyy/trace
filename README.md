# Trace

**Typed, provider-independent product analytics for TypeScript.**

Trace owns how an event is declared, validated, composed, sanitized, gated by
consent, routed and handed to a destination. It does not claim that a provider
accepted, stored or processed an event unless the destination gives evidence
for that exact boundary.

Trace is under construction. Nothing is published yet, and the public API is
not final.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` builds every package, then runs the TypeScript, ESLint and
Prettier checks and the unit tests. See [CONTRIBUTING.md](CONTRIBUTING.md) for
the layout and the code rules.

## License

[MIT](LICENSE)
