import type { Option } from "example-shared/types/Option";

/** 6 s outlasts Boutique's 3 s timeout, so the backend's outcome turns unconfirmed. */
export const LATENCY_OPTIONS: Option<number>[] = [
  { value: 0, label: "0 ms" },
  { value: 500, label: "500 ms" },
  { value: 6_000, label: "6 s" },
];
