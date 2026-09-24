import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

import * as api from "src/index";
import * as mock from "src/mock";
import * as testing from "src/testing";

test("every entry exports exactly its public runtime names", () => {
  expect(Object.keys(api).sort()).toEqual([
    "Trace",
    "TraceError",
    "event",
    "isSensitiveKey",
  ]);
  expect(Object.keys(mock).sort()).toEqual(["createMockAdapter"]);
  expect(Object.keys(testing).sort()).toEqual(["testAnalyticsAdapter"]);
});

test("the core never branches on an adapter name: no source holds one as a string", () => {
  const sources = new URL(".", import.meta.url);
  const adapters = readdirSync(new URL("../../adapters/", import.meta.url));

  const files = readdirSync(sources, { encoding: "utf8", recursive: true });

  const found = files.flatMap((file) => {
    if (!file.endsWith(".ts") || /\.(test|contracts|fixture)\.ts$/.test(file)) {
      return [];
    }

    const code = readFileSync(new URL(file, sources), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    return adapters.flatMap((adapter) => {
      if (!new RegExp(`["'\`]${adapter}["'\`]`).test(code)) {
        return [];
      }

      return [`${file}: ${adapter}`];
    });
  });

  expect(adapters).toContain("posthog");
  expect(found).toEqual([]);
});
