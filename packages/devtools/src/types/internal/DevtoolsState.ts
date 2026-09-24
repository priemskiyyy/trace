export type DevtoolsState = {
  panel:
    | { state: "OPEN"; autoFocus: boolean }
    | { state: "CLOSED"; autoFocus: boolean; closedAfter: number };
  isPaused: boolean;
};
