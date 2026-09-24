export type Answer =
  | { kind: "RESULT"; value: unknown }
  | { kind: "PENDING"; promise: Promise<unknown> }
  | { kind: "THREW"; error: unknown };
