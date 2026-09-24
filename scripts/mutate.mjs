// Mutation checks require a green baseline and restore every changed file.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const MUTANTS = [
  {
    file: "packages/core/src/utils/internal/consent/ConsentState.ts",
    find: 'const applied = isConsentDecision(decision) ? decision : "denied";',
    replace:
      'const applied = isConsentDecision(decision) ? decision : "granted";',
    describes: "an unreadable consent decision failing open",
  },
  {
    file: "packages/core/src/utils/internal/consent/ConsentState.ts",
    find: 'return purposes.every((purpose) => this.#decisions[purpose] === "granted");',
    replace:
      'return purposes.some((purpose) => this.#decisions[purpose] === "granted");',
    describes: "one granted purpose opening a destination that needs several",
  },
  {
    file: "packages/core/src/utils/internal/destinations/DestinationLane.ts",
    find: "if (entry.event.identity.generation < this.#floor) {",
    replace: "if (entry.event.identity.generation < 0) {",
    describes: "a signed-out user's event accepted after the switch",
  },
  {
    file: "packages/core/src/utils/internal/destinations/DestinationLane.ts",
    find: "({ entry }) => entry.event.identity.generation < generation,",
    replace: "({ entry }) => entry.event.identity.generation < 0,",
    describes: "the previous user's buffered events surviving a switch",
  },
  {
    file: "packages/core/src/utils/internal/destinations/getStepFailure.ts",
    find: 'return step.kind === "reset" ? "unsupported" : null;',
    replace: "return null;",
    describes: "a reset the provider could not perform treated as done",
  },
  {
    file: "packages/core/src/utils/internal/privacy/sanitizeValue.ts",
    find: "if (walk.policy.redact(key, path)) {",
    replace: "if (false) {",
    describes: "a redacted key delivered (release gate 11)",
  },
  {
    file: "packages/core/src/utils/internal/privacy/sanitizeValue.ts",
    find: "if (UNSAFE_PROPERTY_KEYS.includes(key)) {",
    replace: "if (false) {",
    describes: "a __proto__ key copied into published data",
  },
  {
    file: "packages/core/src/utils/constants/privacy.ts",
    find: "credential|bearer|jwt",
    replace: "credential|jwt",
    describes: "a bearer token no longer redacted by default",
  },
  {
    file: "packages/core/src/utils/internal/destinations/getTrackOutcome.ts",
    find: "if (!isTrackEvidence(evidence)) {",
    replace: "if (false) {",
    describes:
      "invented evidence accepted, so a receipt claims more than the provider proved",
  },
  {
    file: "packages/core/src/utils/internal/dispatch/createReceipt.ts",
    find: 'if (current.state !== "pending" || current.outcomes[name] !== null) {',
    replace: 'if (current.state !== "pending") {',
    describes: "a destination landing twice",
  },
  {
    file: "packages/core/src/utils/internal/identity/IdentityState.ts",
    find: "const ended = current.user !== null;",
    replace: "const ended = false;",
    describes: "a user switch keeping the previous user's traits and groups",
  },
  {
    file: "packages/core/src/utils/internal/identity/planIdentity.ts",
    find: "if (gap === 0 || gap === 1) {",
    replace: "if (gap === 0) {",
    describes:
      "an anonymous visitor's sign-in resetting the provider, detaching its history",
  },
  {
    file: "packages/core/src/utils/internal/routing/resolveRoute.ts",
    find: "return configured.filter((name) => names.includes(name));",
    replace: "return [...configured];",
    describes: "a per-call to ignored",
  },
  {
    file: "packages/core/src/utils/internal/destinations/LaneBuffer.ts",
    find: "this.#waiting.length > this.#options.capacity",
    replace: "this.#waiting.length > this.#options.capacity + 1",
    describes: "a buffer holding one more than its capacity",
  },
];

// The package manager prints its own banner to stdout before the reporter
// does, so the report starts at the first brace rather than at the first byte.
const countFailures = (text) => {
  const start = text.indexOf('{"numTotalTestSuites"');

  if (start === -1) {
    return -1;
  }

  try {
    return JSON.parse(text.slice(start)).numFailedTests ?? -1;
  } catch {
    return -1;
  }
};

const projectOf = (file) => {
  const adapter = /packages\/adapters\/([^/]+)\//.exec(file);

  return adapter === null ? "core" : adapter[1];
};

const failingTests = (project) => {
  try {
    return countFailures(
      execFileSync(
        "node_modules/.bin/vitest",
        ["run", "--project", project, "--reporter", "json"],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ),
    );
  } catch (error) {
    // A non-zero exit is the normal case for a caught mutant, so the report on
    // stdout still decides. Only an unparseable report is a runner failure.
    return countFailures(String(error.stdout ?? ""));
  }
};

const baseline = failingTests("core");

if (baseline !== 0) {
  console.error(
    `The baseline is not green (${baseline} failing). A mutation run against a ` +
      `red baseline proves nothing. Fix the suite first.`,
  );
  process.exit(1);
}

for (const project of new Set(
  MUTANTS.map((mutant) => projectOf(mutant.file)),
)) {
  if (project === "core") {
    continue;
  }

  if (failingTests(project) !== 0) {
    console.error(`The ${project} baseline is not green. Fix the suite first.`);
    process.exit(1);
  }
}

console.log("Baseline green. Running mutants.\n");

let caught = 0;
const survivors = [];

for (const mutant of MUTANTS) {
  const path = new URL(mutant.file, `file://${root}`);
  const original = readFileSync(path, "utf8");

  if (!original.includes(mutant.find)) {
    console.error(
      `Mutant is stale, its target text is gone: ${mutant.describes}`,
    );
    process.exit(1);
  }

  try {
    writeFileSync(path, original.replace(mutant.find, mutant.replace));

    const failed = failingTests(projectOf(mutant.file));

    if (failed > 0) {
      caught += 1;
      console.log(`caught   ${mutant.describes} (${failed} tests went red)`);
      continue;
    }

    survivors.push(mutant.describes);
    console.log(`SURVIVED ${mutant.describes}`);
  } finally {
    writeFileSync(path, original);
  }
}

console.log(`\n${caught} of ${MUTANTS.length} mutants caught.`);

if (survivors.length > 0) {
  console.error("\nSurvivors, each either a missing test or dead code:");

  for (const survivor of survivors) {
    console.error(`  ${survivor}`);
  }

  process.exit(1);
}
