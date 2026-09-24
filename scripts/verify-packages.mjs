import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const artifacts = path.join(workspace, ".artifacts");
const release = path.join(artifacts, "release");
const consumer = mkdtempSync(path.join(tmpdir(), "trace-consumer-"));

const rootPackage = JSON.parse(
  readFileSync(path.join(workspace, "package.json"), "utf8"),
);

const run = (command, args, cwd = consumer) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 300_000,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
      { cause: result.error },
    );
  }

  return result.stdout;
};

const write = (name, content) =>
  writeFileSync(path.join(consumer, name), content);

const json = (name, value) =>
  write(name, `${JSON.stringify(value, null, 2)}\n`);

// Copies a packed tarball with its checksum into the directory the publish
// workflow uploads as the release artifact.
const stageRelease = (name, tarball) => {
  const directory = path.join(release, name);
  const filename = path.basename(tarball);

  const checksum = createHash("sha256")
    .update(readFileSync(tarball))
    .digest("hex");

  mkdirSync(directory, { recursive: true });
  copyFileSync(tarball, path.join(directory, filename));
  writeFileSync(
    path.join(directory, "SHA256SUMS"),
    `${checksum}  ${filename}\n`,
  );
};

const read = (file) =>
  readFileSync(path.join(consumer, "node_modules", file), "utf8");

const packages = ["packages", "packages/adapters"].flatMap((group) =>
  readdirSync(path.join(workspace, group))
    .filter((directory) =>
      existsSync(path.join(workspace, group, directory, "package.json")),
    )
    .map((directory) => {
      const packageDirectory = path.join(workspace, group, directory);

      const manifest = JSON.parse(
        readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
      );

      return { group, directory: packageDirectory, manifest };
    }),
);

// A manifest cannot say which entries are client modules, so they are listed.
const clientEntries = [
  "@priemskiyyy/trace-react/dist/index.js",
  "@priemskiyyy/trace-devtools/dist/react.js",
];

// An adapter is handed its SDK by the application, so its bundle imports no
// optional peer: not the peer's scope, or the peer itself when it has none.
const getProviderPrefixes = ({ group, manifest }) => {
  if (group !== "packages/adapters") {
    return [];
  }

  return Object.keys(manifest.peerDependenciesMeta ?? {}).map((name) => {
    if (name.startsWith("@")) {
      return `${name.split("/")[0]}/`;
    }

    return name;
  });
};

for (const { manifest } of packages) {
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const expected =
      manifest.name === "@priemskiyyy/trace-svelte"
        ? ["types", "svelte"]
        : ["types", "import", "default"];

    assert.deepEqual(
      Object.keys(target),
      expected,
      `${manifest.name}${subpath.slice(1)} exports its conditions out of order.`,
    );
  }
}

// Every published entry. Svelte ships its sources unbundled, for the
// application's own compiler, under its own condition.
const bundles = packages.flatMap((entry) =>
  Object.values(entry.manifest.exports).map((target) => {
    const file = path.posix.join(
      entry.manifest.name,
      target.import ?? target.svelte,
    );

    return {
      file,
      client: clientEntries.includes(file),
      sdks: getProviderPrefixes(entry),
    };
  }),
);

// A real import or re-export, not the word in a JSDoc example.
const importsFrom = (bundle, prefix) =>
  new RegExp(
    `^\\s*(?:import|export)[^\\n]*from\\s+"${prefix}|import\\("${prefix}|require\\("${prefix}`,
    "m",
  ).test(bundle);

// Scout research T14: names of internal machinery a consumer never imports.
const INTERNAL_ONLY =
  /DestinationLane|LaneBuffer|IdentityState|ConsentState|\bDiagnostics\b|planIdentity|sanitizeValue|prepareEvent|prepareLayer|readOptions|IdentityTarget|IdentityStep|LaneEntry|\bLayer\b|PrivacyPolicy|DiagnosticRecord|\bSanitized\b|UserChange/;

try {
  rmSync(release, { recursive: true, force: true });
  mkdirSync(artifacts, { recursive: true });

  const tarballs = packages.map(({ directory: packageDirectory, manifest }) => {
    process.stdout.write(
      run("pnpm", ["exec", "publint", packageDirectory], workspace),
    );

    const [packed] = JSON.parse(
      run(
        "npm",
        ["pack", "--ignore-scripts", "--json", "--pack-destination", artifacts],
        packageDirectory,
      ),
    );

    assert(packed.files.some((file) => file.path === "README.md"));
    assert(packed.files.some((file) => file.path === "LICENSE"));
    assert(!packed.files.some((file) => file.path.startsWith("src/")));
    assert(
      !packed.files.some((file) =>
        /\.(test|fixture|contracts)\./.test(file.path),
      ),
    );

    // pnpm rewrites `workspace:*` only when it publishes. A tarball that
    // still carries it cannot be installed by anyone.
    for (const field of ["dependencies", "peerDependencies"]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        assert(
          !String(range).startsWith("workspace:"),
          `${manifest.name} publishes ${name} as ${range}.`,
        );
      }
    }

    const tarball = path.join(artifacts, packed.filename);

    stageRelease(packed.name, tarball);

    return tarball;
  });

  json("package.json", {
    name: "trace-package-consumer",
    private: true,
    type: "module",
    dependencies: Object.fromEntries(
      [
        "react",
        "react-dom",
        "@types/react",
        "@types/react-dom",
        "vue",
        "solid-js",
        "svelte",
        "typescript",
        "vitest",
      ].map((name) => [name, rootPackage.devDependencies[name]]),
    ),
  });
  process.stdout.write(
    "Installing packed packages in an isolated consumer...\n",
  );
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    ...tarballs,
  ]);

  for (const { file, client, sdks } of bundles) {
    const bundle = read(file);

    assert(!bundle.includes('from "src/'), `${file} kept a src alias import.`);
    assert.equal(
      bundle.startsWith('"use client";'),
      client,
      `${file} has the wrong "use client" state.`,
    );
    // Default exports break silently under some React Native interop.
    assert(!/^export default /m.test(bundle), `${file} has a default export.`);

    for (const sdk of sdks) {
      assert(!importsFrom(bundle, sdk), `${file} imports ${sdk}.`);
    }
  }

  // Exactly one copy of the core, however many packages build on it.
  for (const { manifest } of packages) {
    if (manifest.name === "@priemskiyyy/trace") {
      continue;
    }

    assert(
      !existsSync(
        path.join(
          consumer,
          "node_modules",
          manifest.name,
          "node_modules/@priemskiyyy/trace",
        ),
      ),
      `${manifest.name} installed its own copy of the core.`,
    );
  }

  for (const wrapper of ["react", "vue", "solid", "svelte"]) {
    assert(
      !read(`@priemskiyyy/trace-devtools/dist/${wrapper}.js`).includes(
        "already mounted",
      ),
      `The devtools ${wrapper} wrapper bundled a second inspector.`,
    );
  }

  // The inspector carries its own Solid runtime, so a host needs none.
  assert(
    !importsFrom(read("@priemskiyyy/trace-devtools/dist/index.js"), "solid-js"),
    "The inspector imports solid-js instead of bundling it.",
  );

  const declarations = read("@priemskiyyy/trace/dist/index.d.ts");

  assert(
    declarations.includes("@example"),
    "Declarations lost their examples.",
  );
  assert(
    !INTERNAL_ONLY.test(declarations),
    "Core declarations expose an internal name.",
  );

  // Every declaration a package's own entry re-exports carries an example
  // (Scout research T14, strengthened to every export, not only the core's),
  // read from source rather than the bundled declarations, whose chunking
  // splits a shared type's declaration away from the entry that names it.
  const DOCUMENTED =
    /(\/\*\*[\s\S]*?\*\/(?:\s|\/\/[^\n]*)*)?^export (?:type|const|class|function|interface) (\w+)/gm;

  const undocumented = (file) => {
    const byName = new Map();

    for (const [, doc, name] of readFileSync(file, "utf8").matchAll(
      DOCUMENTED,
    )) {
      byName.set(
        name,
        (byName.get(name) ?? false) || (doc?.includes("@example") ?? false),
      );
    }

    return Array.from(byName, ([name]) => name).filter(
      (name) => !byName.get(name),
    );
  };

  const ENTRY_FILES = [
    "index.ts",
    "mock.ts",
    "testing.ts",
    "react.tsx",
    "vue.ts",
    "solid.ts",
    "svelte.ts",
  ];

  for (const { directory, manifest } of packages) {
    for (const entryFile of ENTRY_FILES) {
      const source = path.join(directory, "src", entryFile);

      if (!existsSync(source)) {
        continue;
      }

      const reExported = Array.from(
        readFileSync(source, "utf8").matchAll(
          /^export (?:type )?\{[^}]*\} from "(?:src\/|\.\/)([^"]+)"/gm,
        ),
        ([, target]) => target,
      );

      const missing = reExported.flatMap((target) => {
        // A Svelte component's own props are documented in the component
        // file, which this JSDoc scan does not parse.
        if (target.endsWith(".svelte")) {
          return [];
        }

        const file = path.join(
          directory,
          "src",
          `${target.replace(/\.js$/, "")}.ts`,
        );

        return existsSync(file) ? undocumented(file) : [];
      });

      assert.deepEqual(
        missing,
        [],
        `${manifest.name}'s ${entryFile} re-exports an undocumented name: ${missing.join(", ")}`,
      );
    }
  }

  write(
    "contracts.tsx",
    `import { Trace, TraceError, event, isSensitiveKey } from "@priemskiyyy/trace";
import type { AnalyticsAdapter, AnalyticsSession, Receipt } from "@priemskiyyy/trace";
import { createMockAdapter } from "@priemskiyyy/trace/mock";
import type { MockSession } from "@priemskiyyy/trace/mock";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";
import { ampli, fromAmpli, identityPlugin } from "@priemskiyyy/trace-ampli";
import { console } from "@priemskiyyy/trace-console";
import { TraceDevtools } from "@priemskiyyy/trace-devtools";
import { TraceDevtools as TraceDevtoolsView } from "@priemskiyyy/trace-devtools/react";
import { http } from "@priemskiyyy/trace-http";
import { posthog } from "@priemskiyyy/trace-posthog";
import { TraceProvider, useConsent, useDestinationStatus, useTrace, useTraceStatus } from "@priemskiyyy/trace-react";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false;
const expectType = <TCheck extends true>(check: TCheck) => check;

declare const posthogSdk: Parameters<typeof posthog>[0]["sdk"];
declare const amplitudeIdentify: Parameters<typeof ampli>[0]["Identify"];

class CheckoutStarted {
  event_type = "Checkout Started";
  event_properties = { cart_id: "cart_1" };
}

export const trace = new Trace({
  events: {
    "App Opened": event(),
    "Search Performed": event<{ query: string }>(),
  },
  destinations: {
    console: console(),
    backend: http({
      request: async ({ event: tracked, signal }) => {
        const response = await fetch("/api/events", { method: "POST", body: JSON.stringify(tracked), signal });

        return { id: response.headers.get("x-event-id") ?? "unknown" };
      },
    }),
    research: posthog({ sdk: posthogSdk }),
    mock: createMockAdapter().adapter,
  },
  defaults: { to: ["console", "backend"] },
  consent: { research: ["analytics"] },
  privacy: { redact: (key) => isSensitiveKey(key) },
});

// The registered path: one augmentation types every hook and the boundary.
declare module "@priemskiyyy/trace-react" {
  interface Register {
    trace: typeof trace;
  }
}

expectType<Equal<RegisteredDestinationName, "console" | "backend" | "research" | "mock">>(true);

trace.start();
trace.user({ id: "user_42", traits: { plan: "pro" } });
trace.group("workspace", { id: "workspace_1" });
trace.context({ screen: "search" });

const scope = trace.scope({ context: { flow: "checkout" } });

scope.track("App Opened");

const receipt: Receipt<RegisteredDestinationName> = trace.track("Search Performed", { query: "shoes" }, { to: ["backend"] });
export const settled = receipt.settled.then((status) => (status.state === "settled" ? status.outcomes.backend?.status : null));
export const mockSession: MockSession | null = trace.destination("mock").native;

// @ts-expect-error -- "newrelic" is not a configured destination.
trace.destination("newrelic");
// @ts-expect-error -- "Search Performed" needs its query.
trace.track("Search Performed");

await trace.flush({ timeout: 1_000 });
trace.dispose();

// A generated Ampli wrapper's events, over the plugin that files calls under Trace's identity.
const ampliEvents = fromAmpli({ "Checkout Started": CheckoutStarted });
const plugin = identityPlugin();

declare const ampliSdk: Parameters<typeof ampli>[0]["sdk"];

export const ampliTrace = new Trace({
  events: ampliEvents,
  destinations: { product: ampli({ sdk: ampliSdk, Identify: amplitudeIdentify, plugin }) },
});

export const View = () => {
  const registered = useTrace();
  const status = useTraceStatus();
  const backend = useDestinationStatus("backend");
  const consent = useConsent();

  registered.track("App Opened");

  // @ts-expect-error -- "newrelic" is not a registered destination.
  useDestinationStatus("newrelic");

  return <span>{status.state + backend.state + consent.analytics}</span>;
};

export const Root = () => (
  <TraceProvider trace={trace}>
    <View />
    <TraceDevtoolsView initialIsOpen maxEvents={100} />
  </TraceProvider>
);

export const inspector = new TraceDevtools({ trace });

// A third party can write an adapter from the published types alone.
const logged: string[] = [];

export const custom: AnalyticsAdapter<{ write: (line: string) => void }> = {
  name: "log",
  open: (): AnalyticsSession<{ write: (line: string) => void }> => {
    const sdk = { write: (line: string) => logged.push(line) };

    return {
      native: sdk,
      track: (trackedEvent) => {
        sdk.write(JSON.stringify(trackedEvent));

        if (trackedEvent.name === "") {
          throw new TraceError({ code: "DELIVERY_FAILED", message: "unreachable" });
        }

        return { status: "submitted", evidence: "sdk-call-returned" };
      },
    };
  },
};

testAnalyticsAdapter({ name: "log", createAdapter: () => custom });
`,
  );

  write(
    "contracts.frameworks.ts",
    `import { createComponent } from "solid-js";
import { h } from "vue";
import { event, Trace } from "@priemskiyyy/trace";
import { TraceDevtools as SolidDevtools } from "@priemskiyyy/trace-devtools/solid";
import { createDevtools } from "@priemskiyyy/trace-devtools/svelte";
import { TraceDevtools as VueDevtools } from "@priemskiyyy/trace-devtools/vue";
import { ga4 } from "@priemskiyyy/trace-google-analytics";
import { googleAnalytics } from "@priemskiyyy/trace-google-analytics";
import { posthog } from "@priemskiyyy/trace-posthog-node";
import * as solid from "@priemskiyyy/trace-solid";
import type { RegisteredDestinationName as SolidName } from "@priemskiyyy/trace-solid";
import * as svelte from "@priemskiyyy/trace-svelte";
import type { RegisteredDestinationName as SvelteName } from "@priemskiyyy/trace-svelte";
import * as vue from "@priemskiyyy/trace-vue";
import type { RegisteredDestinationName as VueName } from "@priemskiyyy/trace-vue";
import type { trace } from "./contracts.js";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false;
const expectType = <TCheck extends true>(check: TCheck) => check;
type Names = "console" | "backend" | "research" | "mock";

// The registered path, once per binding.
declare module "@priemskiyyy/trace-vue" {
  interface Register {
    trace: typeof trace;
  }
}
declare module "@priemskiyyy/trace-solid" {
  interface Register {
    trace: typeof trace;
  }
}
declare module "@priemskiyyy/trace-svelte" {
  interface Register {
    trace: typeof trace;
  }
}

expectType<Equal<VueName, Names>>(true);
expectType<Equal<SolidName, Names>>(true);
expectType<Equal<SvelteName, Names>>(true);

export const useVue = () => {
  vue.useTrace().value.track("App Opened");
  const state: string = vue.useDestinationStatus("backend").value.state;

  // @ts-expect-error -- "newrelic" is not a registered destination.
  vue.useDestinationStatus("newrelic");

  return [state, vue.useTraceStatus().value.state, h(VueDevtools, { maxEvents: 100 })];
};

export const useSolid = () => {
  solid.useTrace()().track("App Opened");
  const state: string = solid.useDestinationStatus("backend")().state;

  // @ts-expect-error -- "newrelic" is not a registered destination.
  solid.useDestinationStatus("newrelic");

  return [state, solid.useTraceStatus()().state, createComponent(SolidDevtools, { initialIsOpen: true })];
};

export const useSvelte = () => {
  svelte.useTrace().current.track("App Opened");
  const state: string = svelte.useDestinationStatus("backend").current.state;

  // @ts-expect-error -- "newrelic" is not a registered destination.
  svelte.useDestinationStatus("newrelic");

  return [state, svelte.useTraceStatus().current.state, createDevtools({ maxEvents: 100 })];
};

// The overloaded generator that keeps a mapping's name-to-properties relation.
const events = {
  "App Opened": event(),
  "Checkout Started": event<{ cart: { id: string }; value: number }>(),
};
const map = ga4(events, {
  "App Opened": () => null,
  "Checkout Started": (tracked) => ({
    name: "begin_checkout",
    parameters: { value: tracked.properties.value },
  }),
});

declare const gtagFn: Parameters<typeof googleAnalytics>[0]["sdk"];

export const gaTrace = new Trace({
  events,
  destinations: { analytics: googleAnalytics({ sdk: gtagFn, measurement: { id: "G-XXXXXXX" }, map }) },
});

// A server adapter, over a client the application constructed per process.
declare const posthogNodeSdk: Parameters<typeof posthog>[0]["sdk"];

export const serverTrace = new Trace({
  events: { "App Opened": event() },
  destinations: { product: posthog({ sdk: posthogNodeSdk, anonymousId: "visitor_1" }) },
});
`,
  );

  write(
    "smoke.mjs",
    `import assert from "node:assert/strict";
import * as consoleAdapter from "@priemskiyyy/trace-console";
import * as core from "@priemskiyyy/trace";

// Named exports only, and exactly the ones each package promises. The Svelte
// packages ship sources for the application's compiler, so plain Node cannot
// import them; their types are checked above instead.
const surfaces = {
  "@priemskiyyy/trace": ["Trace", "TraceError", "event", "isSensitiveKey"],
  "@priemskiyyy/trace/mock": ["createMockAdapter"],
  "@priemskiyyy/trace/testing": ["testAnalyticsAdapter"],
  "@priemskiyyy/trace-react": ["TraceProvider", "useConsent", "useDestinationStatus", "useTrace", "useTraceStatus"],
  "@priemskiyyy/trace-vue": ["TraceProvider", "useConsent", "useDestinationStatus", "useTrace", "useTraceStatus"],
  "@priemskiyyy/trace-solid": ["TraceProvider", "useConsent", "useDestinationStatus", "useTrace", "useTraceStatus"],
  "@priemskiyyy/trace-devtools": ["TraceDevtools"],
  "@priemskiyyy/trace-devtools/react": ["TraceDevtools"],
  "@priemskiyyy/trace-devtools/vue": ["TraceDevtools"],
  "@priemskiyyy/trace-devtools/solid": ["TraceDevtools"],
  "@priemskiyyy/trace-ampli": ["ampli", "fromAmpli", "identityPlugin"],
  "@priemskiyyy/trace-amplitude": ["amplitude", "identityPlugin"],
  "@priemskiyyy/trace-amplitude-node": ["amplitude"],
  "@priemskiyyy/trace-console": ["console"],
  "@priemskiyyy/trace-fathom": ["fathom"],
  "@priemskiyyy/trace-firebase": ["firebase", "ga4"],
  "@priemskiyyy/trace-firebase-react-native": ["firebase", "ga4"],
  "@priemskiyyy/trace-google-analytics": ["googleAnalytics", "ga4"],
  "@priemskiyyy/trace-heap": ["heap"],
  "@priemskiyyy/trace-http": ["http"],
  "@priemskiyyy/trace-mixpanel": ["mixpanel"],
  "@priemskiyyy/trace-mixpanel-node": ["mixpanel"],
  "@priemskiyyy/trace-mixpanel-react-native": ["mixpanel"],
  "@priemskiyyy/trace-plausible": ["plausible"],
  "@priemskiyyy/trace-posthog": ["posthog"],
  "@priemskiyyy/trace-posthog-node": ["posthog"],
  "@priemskiyyy/trace-posthog-react-native": ["posthog"],
  "@priemskiyyy/trace-rudderstack": ["rudderstack"],
  "@priemskiyyy/trace-segment": ["segment"],
  "@priemskiyyy/trace-segment-node": ["segment"],
  "@priemskiyyy/trace-segment-react-native": ["segment"],
  "@priemskiyyy/trace-umami": ["umami"],
  "@priemskiyyy/trace-vercel": ["vercel"],
};
for (const [specifier, names] of Object.entries(surfaces)) {
  const namespace = await import(specifier);
  assert.deepEqual(Object.keys(namespace).sort(), [...names].sort(), specifier);
  assert.equal("default" in namespace, false, specifier + " has a default export.");
}

// Constructing and tracking before start() reaches no destination: the
// factory is cold and observing creates no demand.
const opened = [];
const inert = {
  name: "inert",
  open: () => {
    opened.push("open");

    return { native: null, track: () => ({ status: "submitted", evidence: "sdk-call-returned" }) };
  },
};

const lines = [];
const trace = new core.Trace({
  events: { "App Opened": core.event() },
  destinations: {
    inert,
    console: consoleAdapter.console({ writer: ({ line }) => lines.push(line) }),
  },
});

const early = trace.track("App Opened");

assert.deepEqual(opened, [], "Constructing and tracking before start() must open nothing.");

trace.start();
assert.deepEqual(opened, ["open"], "start() must open every destination exactly once.");

const status = await early.settled;

assert.equal(status.state, "settled");
assert.deepEqual(status.outcomes.console, {
  status: "submitted",
  evidence: "sdk-call-returned",
  event: null,
  losses: [],
});
assert.equal(lines[0].includes("App Opened"), true);

// One core, so an unknown destination's error is the class this consumer imports.
assert.throws(
  () => trace.destination("unknown"),
  (error) => error instanceof core.TraceError && error.code === "INVALID_CONFIGURATION",
);

trace.dispose();
assert.deepEqual((await trace.track("App Opened").settled), { state: "dropped", reason: "disposed" });

console.log("The packed packages work end to end, with one copy of the core.");
`,
  );

  // testAnalyticsAdapter registers real Vitest tests, so it runs the way an
  // adapter author runs it: inside Vitest, not called from plain Node.
  write(
    "conformance.test.ts",
    `import { createMockAdapter } from "@priemskiyyy/trace/mock";
import { testAnalyticsAdapter } from "@priemskiyyy/trace/testing";

testAnalyticsAdapter({ name: "mock", createAdapter: () => createMockAdapter().adapter });
`,
  );
  write(
    "vitest.config.mjs",
    `export default { test: { include: ["conformance.test.ts"], environment: "node" } };\n`,
  );

  process.stdout.write(
    "Running the conformance suite from the published types...\n",
  );
  run("pnpm", ["exec", "vitest", "run", "--config", "vitest.config.mjs"]);

  process.stdout.write("Typechecking the public contracts...\n");

  for (const [module, resolution] of [
    ["ESNext", "Bundler"],
    ["NodeNext", "NodeNext"],
  ]) {
    run("pnpm", [
      "exec",
      "tsc",
      "--strict",
      "--noUncheckedIndexedAccess",
      "--exactOptionalPropertyTypes",
      "--module",
      module,
      "--moduleResolution",
      resolution,
      "--target",
      "ES2022",
      "--jsx",
      "react-jsx",
      "--skipLibCheck",
      "--noEmit",
      "contracts.tsx",
      "contracts.frameworks.ts",
    ]);

    // `--skipLibCheck` above keeps the pass fast; this program checks the
    // packages' own emitted declarations at `skipLibCheck: false`, without
    // paying to check the whole of React, Node and DOM's library types too.
    const program = ts.createProgram(
      [
        path.join(consumer, "contracts.tsx"),
        path.join(consumer, "contracts.frameworks.ts"),
      ],
      {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        module:
          module === "NodeNext" ? ts.ModuleKind.NodeNext : ts.ModuleKind.ESNext,
        moduleResolution:
          resolution === "NodeNext"
            ? ts.ModuleResolutionKind.NodeNext
            : ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        skipLibCheck: false,
        noEmit: true,
      },
    );

    const declarationFiles = program
      .getSourceFiles()
      .filter((source) =>
        /[/\\]@priemskiyyy[/\\]trace(?:-[^/\\]+)?[/\\]dist[/\\].+\.d\.ts$/.test(
          source.fileName,
        ),
      );

    // The contracts exercise a representative subset of the published
    // entries, not all of them; this is a floor against a silent no-op.
    assert(
      declarationFiles.length >= 15,
      "A packed declaration entry was not loaded.",
    );

    const declarationErrors = declarationFiles.flatMap((source) => [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ]);

    assert.equal(
      declarationErrors.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(declarationErrors, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => consumer,
        getNewLine: () => "\n",
      }),
    );
  }

  process.stdout.write(
    "Running the packed packages under Node, with no DOM...\n",
  );
  process.stdout.write(run("node", ["smoke.mjs"]));
  process.stdout.write(
    `Verified ${tarballs.length} packages. Release artifacts are in .artifacts/release.\n`,
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
