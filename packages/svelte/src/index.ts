export { default as TraceProvider } from "./context/TraceProvider.svelte";
export { useConsent } from "./utilities/useConsent.js";
export { useDestinationStatus } from "./utilities/useDestinationStatus.js";
export { useTrace } from "./utilities/useTrace.js";
export { useTraceStatus } from "./utilities/useTraceStatus.js";

export type { ReadableValue } from "./types/ReadableValue.js";
export type {
  Register,
  RegisteredDestinationName,
  RegisteredEvents,
  RegisteredPurpose,
  RegisteredTrace,
} from "./types/Register.js";
export type { TraceProviderProps } from "./types/TraceProviderProps.js";
