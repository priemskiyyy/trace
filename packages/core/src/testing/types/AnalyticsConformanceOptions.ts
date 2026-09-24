import type { AnalyticsAdapter } from "src/types/AnalyticsAdapter";

/**
 * What `testAnalyticsAdapter` needs: a label for its `describe` block and a
 * factory for the adapter under test.
 *
 * @example
 * ```ts
 * const options: AnalyticsConformanceOptions = {
 *   name: "console",
 *   createAdapter: () => console({ writer: () => {} }),
 * };
 * ```
 */
export type AnalyticsConformanceOptions = {
  /** Labels the generated block as `<name> adapter conformance`. */
  name: string;
  /** Creates a cold adapter over a fake or stubbed provider SDK, once per test. */
  createAdapter: () => AnalyticsAdapter;
};
