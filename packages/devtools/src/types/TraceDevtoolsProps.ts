import type { TraceDevtoolsOptions } from "src/types/TraceDevtoolsOptions";

/**
 * Props of each framework wrapper: the inspector's options without `trace`,
 * which the wrapper reads from its binding's provider.
 *
 * @example
 * ```ts
 * const props: TraceDevtoolsProps = { initialIsOpen: true, maxEvents: 500 };
 * ```
 */
export type TraceDevtoolsProps = Omit<TraceDevtoolsOptions, "trace">;
