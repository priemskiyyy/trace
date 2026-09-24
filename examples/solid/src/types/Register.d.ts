import type { BoutiqueTrace } from "example-shared/boutique/reporting/types/BoutiqueTrace";

declare module "@priemskiyyy/trace-solid" {
  interface Register {
    trace: BoutiqueTrace;
  }
}
