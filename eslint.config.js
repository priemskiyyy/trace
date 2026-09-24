import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import svelte from "eslint-plugin-svelte";
import vue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

const toRestrictions = (entries) =>
  entries.map(([selector, message]) => ({ selector, message }));

const relativeImports = toRestrictions([
  [
    "ImportDeclaration[source.value=/^[.]/]",
    "Use src/... imports or public package imports.",
  ],
  [
    "ExportNamedDeclaration[source.value=/^[.]/]",
    "Use src/... imports for public exports.",
  ],
  [
    "ImportExpression[source.value=/^[.]/]",
    "Use src/... imports for dynamic imports.",
  ],
  [
    "TSImportType[source.value=/^[.]/]",
    "Use src/... imports for imported types.",
  ],
]);

const bannedSyntax = toRestrictions([
  [
    "TSAsExpression",
    "Do not use type assertions, including as const. Narrow the value, annotate the type, or use satisfies.",
  ],
  [
    "TSTypeAssertion",
    "Do not use type assertions. Narrow the value, annotate the type, or use satisfies.",
  ],
  ["TSNonNullExpression", "Narrow nullable values before using them."],
  ["TSEnumDeclaration", "Use a string union instead of an enum."],
  ["SwitchStatement", "Use explicit conditional dispatch."],
  [
    "UnaryExpression[operator='void']",
    "Handle promise completion and failures explicitly.",
  ],
  ["AssignmentExpression[operator='??=']", "Use explicit assignment."],
  ["AssignmentExpression[operator='||=']", "Use explicit assignment."],
  ["AssignmentExpression[operator='&&=']", "Use explicit assignment."],
  ["TSPropertySignature[readonly=true]", "Use mutable public property types."],
  ["TSIndexSignature[readonly=true]", "Use mutable index signatures."],
  ["PropertyDefinition[readonly=true]", "Use mutable property types."],
  ["TSParameterProperty[readonly=true]", "Use mutable property types."],
  [
    "TSMappedType[readonly]",
    "Do not add readonly mapped modifiers. Use the mutable type; published data is frozen at runtime.",
  ],
  ["TSTypeOperator[operator='readonly']", "Use mutable array types."],
  [
    "TSTypeReference[typeName.name=/^(Readonly|ReadonlyArray|ReadonlyMap|ReadonlySet|DeepReadonly)$/]",
    "Do not use readonly utility types. Use the mutable type; published data is frozen at runtime.",
  ],
  ["ExportAllDeclaration", "List public exports explicitly."],
]);

const reexports = toRestrictions([
  [
    "ExportNamedDeclaration[source]",
    "Keep explicit re-exports at public package entry points only.",
  ],
]);

const entryPoints = [
  "packages/*/src/index.ts",
  "packages/adapters/*/src/index.ts",
  "packages/core/src/mock.ts",
  "packages/core/src/testing.ts",
  "packages/devtools/src/{react,vue,solid,svelte}.{ts,tsx}",
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.svelte-kit/**",
      ".artifacts/**",
      "docs/.vitepress/cache/**",
      "docs/.vitepress/dist/**",
      // A real generated Ampli wrapper, kept byte for byte as a fixture.
      "packages/adapters/ampli/src/ampli-v2-generated.ts",
      "**/generated/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    // No inline comment can switch a rule off; an exception is a file-scoped block here.
    linterOptions: { noInlineConfig: true },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  ...svelte.configs.recommended,
  {
    // Template comments disable rules through these two plugin rules, which noInlineConfig does not reach.
    files: ["**/*.vue"],
    rules: { "vue/comment-directive": "off" },
  },
  {
    files: ["**/*.svelte"],
    rules: { "svelte/comment-directive": "off" },
  },
  {
    files: ["**/*.{js,mjs,ts,tsx,vue,svelte}"],
    rules: {
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: ["const", "let"] },
        { blankLine: "always", prev: ["const", "let"], next: "*" },
        {
          blankLine: "any",
          prev: ["singleline-const", "singleline-let"],
          next: ["singleline-const", "singleline-let"],
        },
        { blankLine: "always", prev: "*", next: "block-like" },
        { blankLine: "always", prev: "block-like", next: "*" },
        { blankLine: "always", prev: "*", next: "return" },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx,vue,svelte}"],
    rules: {
      curly: ["error", "all"],
      "no-else-return": ["error", { allowElseIf: false }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": ["error", ...relativeImports, ...bannedSyntax],
    },
  },
  {
    // Declaration merging needs an interface, so each binding's Register is one.
    files: ["packages/{react,vue,solid,svelte}/src/types/Register.ts"],
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    files: ["packages/**/src/**/*.{ts,tsx,vue,svelte}"],
    ignores: entryPoints,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...relativeImports,
        ...bannedSyntax,
        ...reexports,
      ],
    },
  },
  {
    // svelte-package rewrites no aliases, so the Svelte binding imports by relative path.
    files: ["packages/svelte/**/*.{ts,svelte}"],
    rules: { "no-restricted-syntax": ["error", ...bannedSyntax] },
  },
  {
    files: ["packages/svelte/src/**/*.{ts,svelte}"],
    ignores: entryPoints,
    rules: { "no-restricted-syntax": ["error", ...bannedSyntax, ...reexports] },
  },
  {
    files: [
      "packages/react/**/*.{ts,tsx}",
      "packages/devtools/src/react.tsx",
      "packages/devtools/src/react.test.{ts,tsx}",
      "examples/react/**/*.{ts,tsx}",
      "examples/expo/**/*.{ts,tsx}",
    ],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["**/*.vue"],
    rules: {
      "vue/multi-word-component-names": ["error", { ignores: ["Application"] }],
      // Prettier owns template layout, including compact inline elements.
      "vue/singleline-html-element-content-newline": "off",
      "vue/max-attributes-per-line": "off",
    },
  },
  {
    files: ["**/*.{vue,svelte}", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue", ".svelte"],
      },
    },
    rules: { "no-undef": "off" },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Buffer: "readonly",
      },
    },
  },
);
