export type UserChange =
  { kind: "UNCHANGED" } | { kind: "CHANGED"; ended: boolean };
