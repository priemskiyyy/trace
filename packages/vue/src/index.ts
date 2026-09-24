export { useConsent } from "src/composables/useConsent";
export { useDestinationStatus } from "src/composables/useDestinationStatus";
export { useTrace } from "src/composables/useTrace";
export { useTraceStatus } from "src/composables/useTraceStatus";
export { TraceProvider } from "src/context/TraceProvider";

export type { TraceProviderProps } from "src/context/TraceProvider";
export type {
  Register,
  RegisteredDestinationName,
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "src/types/Register";
