import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";

export type TimelineEntry = TraceDiagnosticEvent & { id: number };
