import { svelte } from "@sveltejs/vite-plugin-svelte";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";
import type { TestProjectConfiguration } from "vitest/config";

type ProjectOptions = {
  environment: "node" | "jsdom";
  dedupe: string[];
};

const project = (
  directory: string,
  name: string,
  options: Partial<ProjectOptions> = {},
) =>
  ({
    extends: true,
    resolve: {
      alias: {
        src: fileURLToPath(
          new URL(`./${directory}/${name}/src`, import.meta.url),
        ),
      },
      dedupe: options.dedupe ?? [],
    },
    test: {
      name,
      include: [`${directory}/${name}/src/**/*.test.{ts,tsx}`],
      environment: options.environment ?? "node",
    },
  }) satisfies TestProjectConfiguration;

const adapters = new URL("./packages/adapters/", import.meta.url);

const adapterProjects = (existsSync(adapters) ? readdirSync(adapters) : [])
  .filter((name) => existsSync(new URL(`${name}/package.json`, adapters)))
  .map((name) => project("packages/adapters", name));

const bindings: Record<string, TestProjectConfiguration[]> = {
  react: [
    project("packages", "react", {
      environment: "jsdom",
      // A binding must render against the same React instance as the renderer under test.
      dedupe: ["react", "react-dom"],
    }),
  ],
  vue: [
    {
      ...project("packages", "vue", {
        environment: "jsdom",
        dedupe: ["vue"],
      }),
      test: {
        name: "vue",
        environment: "jsdom",
        include: ["packages/vue/src/**/*.test.ts"],
        exclude: ["**/*.server.test.ts"],
      },
    },
    {
      ...project("packages", "vue", { dedupe: ["vue"] }),
      test: {
        name: "vue-ssr",
        include: ["packages/vue/src/**/*.server.test.ts"],
        environment: "node",
      },
    },
  ],
  solid: [
    {
      ...project("packages", "solid"),
      plugins: [solid()],
      resolve: {
        alias: {
          src: fileURLToPath(new URL("./packages/solid/src", import.meta.url)),
        },
        conditions: ["development", "browser"],
        dedupe: ["solid-js"],
      },
      test: {
        name: "solid",
        environment: "jsdom",
        include: ["packages/solid/src/**/*.test.{ts,tsx}"],
        exclude: ["**/*.server.test.tsx", "**/hydration.test.tsx"],
        server: {
          deps: { inline: [/solid-js/, /@solidjs\/testing-library/] },
        },
      },
    },
    {
      ...project("packages", "solid"),
      plugins: [solid({ ssr: true })],
      test: {
        name: "solid-ssr",
        environment: "node",
        include: ["packages/solid/src/**/*.server.test.tsx"],
      },
    },
    {
      ...project("packages", "solid"),
      // In jsdom this compiles hydratable DOM output, which claims the markup the server test pins.
      plugins: [solid({ ssr: true })],
      resolve: {
        alias: {
          src: fileURLToPath(new URL("./packages/solid/src", import.meta.url)),
        },
        conditions: ["development", "browser"],
        dedupe: ["solid-js"],
      },
      test: {
        name: "solid-hydration",
        environment: "jsdom",
        include: ["packages/solid/src/**/hydration.test.tsx"],
        server: {
          deps: { inline: [/solid-js/, /@solidjs\/testing-library/] },
        },
      },
    },
  ],
  svelte: [
    {
      ...project("packages", "svelte"),
      plugins: [svelte({ configFile: false })],
      resolve: { conditions: ["browser"] },
      test: {
        name: "svelte",
        environment: "jsdom",
        include: ["packages/svelte/src/**/*.test.ts"],
        exclude: ["**/*.server.test.ts"],
      },
    },
    {
      ...project("packages", "svelte"),
      plugins: [svelte({ configFile: false })],
      test: {
        name: "svelte-ssr",
        environment: "node",
        include: ["packages/svelte/src/**/*.server.test.ts"],
      },
    },
  ],
};

const bindingProjects = Object.entries(bindings).flatMap(([name, projects]) => {
  if (
    !existsSync(new URL(`./packages/${name}/package.json`, import.meta.url))
  ) {
    return [];
  }

  return projects;
});

export default defineConfig({
  test: {
    globals: false,
    restoreMocks: true,
    projects: [
      {
        ...project("packages", "core"),
        test: {
          ...project("packages", "core").test,
          execArgv: ["--expose-gc"],
        },
      },
      ...bindingProjects,
      ...adapterProjects,
    ],
  },
});
