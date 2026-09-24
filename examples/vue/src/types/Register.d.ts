import type { BoutiqueTrace } from "example-shared/boutique/reporting/types/BoutiqueTrace";

declare module "@priemskiyyy/trace-vue" {
  interface Register {
    trace: BoutiqueTrace;
  }
}
