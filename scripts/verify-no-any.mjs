import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// ESLint's `no-explicit-any` sees only the written keyword, so a binding that
// infers `any` from an untyped library call (Object.entries, a bare `new
// Map()`, a lib callback) never shows up there, and the type-aware
// `no-unsafe-*` rules need a type-checked config this repository does not
// run. This walks every package's own program instead, over its own
// tsconfig.json, and fails on a variable, parameter or property binding with
// no type annotation whose resolved type is `any`.

const workspace = fileURLToPath(new URL("..", import.meta.url));

const packageDirs = ["packages", "packages/adapters"].flatMap((group) => {
  const base = path.join(workspace, group);

  if (!existsSync(base)) {
    return [];
  }

  return readdirSync(base)
    .filter((name) => existsSync(path.join(base, name, "package.json")))
    .map((name) => path.join(base, name));
});

// `.test.`, `.fixture.` and `.contracts.` are the one family of files
// verify-packages.mjs also keeps out of a published tarball: none of them
// ship, and a fixture's fake SDK or a contract's deliberately wrong value can
// legitimately need a loose type to construct the case it proves.
const isTestFile = (fileName) =>
  /\.(test|sdk\.test|fixture|contracts)\.tsx?$/.test(fileName);

// A real generated Ampli wrapper, kept byte for byte as a fixture and
// excluded from ESLint the same way.
const isGeneratedFixture = (fileName) =>
  fileName.endsWith("ampli-v2-generated.ts");

const describeBinding = (node) => {
  if (ts.isParameter(node)) {
    return "parameter";
  }

  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    return "property";
  }

  return "variable";
};

// `getTypeAtLocation` on a declaration whose name is a binding pattern (a
// destructure) resolves to `any` itself, regardless of what it destructures;
// the pattern's own elements are each their own binding and are checked on
// their own turn, so only a plain identifier name is checked here.
const isCheckableBinding = (node) =>
  (ts.isParameter(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isBindingElement(node)) &&
  ts.isIdentifier(node.name);

const findings = [];

for (const packageDir of packageDirs) {
  const configPath = ts.findConfigFile(
    packageDir,
    ts.sys.fileExists,
    "tsconfig.json",
  );

  if (configPath === undefined) {
    continue;
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageDir,
  );

  // A Svelte template cannot be parsed by the plain compiler API; its .ts
  // siblings under the same package are still checked.
  const fileNames = parsed.fileNames.filter(
    (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx"),
  );

  const program = ts.createProgram({
    rootNames: fileNames,
    options: { ...parsed.options, noEmit: true },
  });

  const checker = program.getTypeChecker();
  const srcDir = `${path.join(packageDir, "src")}${path.sep}`;

  for (const sourceFile of program.getSourceFiles()) {
    if (
      !sourceFile.fileName.startsWith(srcDir) ||
      isTestFile(sourceFile.fileName) ||
      isGeneratedFixture(sourceFile.fileName)
    ) {
      continue;
    }

    const visit = (node) => {
      if (isCheckableBinding(node) && node.type === undefined) {
        const type = checker.getTypeAtLocation(node);

        if ((type.flags & ts.TypeFlags.Any) !== 0) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );

          findings.push(
            `${path.relative(workspace, sourceFile.fileName)}:${line + 1} ${describeBinding(node)} "${node.name.getText(sourceFile)}" infers any`,
          );
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.stderr.write(`${findings.length} binding(s) infer any.\n`);
  process.exit(1);
}

console.log(`No inferred any in ${packageDirs.length} packages' src.`);
