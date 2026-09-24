import type { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";

declare module "@priemskiyyy/trace-solid" {
  interface Register {
    trace: ReturnType<typeof createBoutiqueTrace>;
  }
}
