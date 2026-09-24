import type { BoutiqueTrace } from "example-shared/boutique/reporting/types/BoutiqueTrace";

declare module "@priemskiyyy/trace-react" {
  interface Register {
    trace: BoutiqueTrace;
  }
}
