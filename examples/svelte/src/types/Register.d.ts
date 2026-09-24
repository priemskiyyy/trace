import type { BoutiqueTrace } from "example-shared/boutique/reporting/types/BoutiqueTrace";

declare module "@priemskiyyy/trace-svelte" {
  interface Register {
    trace: BoutiqueTrace;
  }
}
