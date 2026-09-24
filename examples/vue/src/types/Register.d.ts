import type { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";

declare module "@priemskiyyy/trace-vue" {
  interface Register {
    trace: ReturnType<typeof createBoutiqueTrace>;
  }
}
