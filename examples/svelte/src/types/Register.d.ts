import type { createBoutiqueTrace } from "src/trace/createBoutiqueTrace";

declare module "@priemskiyyy/trace-svelte" {
  interface Register {
    trace: ReturnType<typeof createBoutiqueTrace>;
  }
}
