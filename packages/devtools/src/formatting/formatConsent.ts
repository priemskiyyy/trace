import type { TraceSnapshot } from "@priemskiyyy/trace";

export const formatConsent = (consent: TraceSnapshot["consent"]) =>
  Object.entries(consent)
    .map(([purpose, decision]) => `${purpose} ${decision}`)
    .join(" · ");
