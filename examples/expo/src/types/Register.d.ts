import type { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";

declare module "@priemskiyyy/trace-react" {
  interface Register {
    trace: ReturnType<typeof createBoutiqueTrace>;
  }
}
