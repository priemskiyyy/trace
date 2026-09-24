import type { Answer } from "src/types/internal/Answer";

export type StepAnswer =
  Exclude<Answer, { kind: "PENDING" }> | { kind: "TIMEOUT" };
