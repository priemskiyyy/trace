import type { Receipt } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-svelte";

export type TrackedReceipt = {
  receipt: Receipt<RegisteredDestinationName>;
  action: string;
  at: number;
};
