export type DevtoolsAction =
  | { kind: "OPEN" }
  | { kind: "CLOSE"; after: number }
  | { kind: "TOGGLE_PAUSE" };
