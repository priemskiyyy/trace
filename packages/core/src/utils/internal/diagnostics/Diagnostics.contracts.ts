import { expectTypeOf } from "vitest";

import type { ConsentDecision } from "src/types/ConsentDecision";
import type { DestinationOutcome } from "src/types/DestinationOutcome";
import type { FlushResult } from "src/types/FlushResult";
import type { DiagnosticRecord } from "src/types/internal/DiagnosticRecord";
import type { MappingLoss } from "src/types/MappingLoss";
import type { TraceDiagnosticEvent } from "src/types/TraceDiagnosticEvent";
import type { TrackedEvent } from "src/types/TrackedEvent";
import { DIAGNOSTIC_TYPES } from "src/utils/constants/diagnostics";
import type { Diagnostics } from "src/utils/internal/diagnostics/Diagnostics";

declare const diagnostics: Diagnostics;
declare const base: DiagnosticRecord;
declare const decisions: Record<string, ConsentDecision>;
declare const losses: MappingLoss[];
declare const error: unknown;
declare const outcome: DestinationOutcome;
declare const flush: FlushResult;
declare const event: TrackedEvent;

expectTypeOf<DiagnosticRecord["type"]>().toEqualTypeOf<
  (typeof DIAGNOSTIC_TYPES)[keyof typeof DIAGNOSTIC_TYPES]
>();
expectTypeOf<DiagnosticRecord["type"]>().toEqualTypeOf<
  | "trace started"
  | "trace disposed"
  | "destination ready"
  | "destination failed"
  | "destination disposed"
  | "destination dispose failed"
  | "destination collection failed"
  | "user changed"
  | "user refused"
  | "group refused"
  | "traits refused"
  | "identity step failed"
  | "identity step unsupported"
  | "consent changed"
  | "event accepted"
  | "event dropped"
  | "event submitted"
  | "event failed"
  | "event skipped"
  | "event indeterminate"
  | "buffer overflow"
  | "flush started"
  | "flush completed"
  | "listener failed"
>();
expectTypeOf<TraceDiagnosticEvent["type"]>().toEqualTypeOf<string>();

diagnostics.record({
  source: "event",
  type: "event accepted",
  destination: null,
  event: "event-1",
});
diagnostics.record({
  source: "runtime",
  type: DIAGNOSTIC_TYPES.TRACE_STARTED,
  destination: null,
  event: null,
});
diagnostics.record({
  source: "destination",
  type: DIAGNOSTIC_TYPES.DESTINATION_DISPOSE_FAILED,
  destination: "product",
  event: null,
});
diagnostics.record({
  source: "destination",
  type: DIAGNOSTIC_TYPES.DESTINATION_COLLECTION_FAILED,
  destination: "product",
  event: null,
  context: { enabled: false },
});
diagnostics.record({
  source: "event",
  // @ts-expect-error A phrase outside the closed list of diagnostic types cannot be recorded.
  type: "event delivered",
  destination: null,
  event: "event-1",
});

diagnostics.record({ ...base, context: { reason: "consent" } });
diagnostics.record({ ...base, context: { count: 3, generation: 2 } });
diagnostics.record({ ...base, context: { paths: ["timestamp"], losses } });
diagnostics.record({ ...base, context: { decisions, status: "timeout" } });

// @ts-expect-error A provider's error may quote configuration or payload.
diagnostics.record({ ...base, context: { error } });

// @ts-expect-error An outcome can carry a provider's error.
diagnostics.record({ ...base, context: { outcome } });

// @ts-expect-error A flush result can carry a provider's error.
diagnostics.record({ ...base, context: { flush } });

// @ts-expect-error An event carries properties, context and traits.
diagnostics.record({ ...base, context: { event } });

// @ts-expect-error An error is an object with a class, not plain data.
diagnostics.record({ ...base, context: { failure: new Error("token=abc") } });
