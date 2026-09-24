import type { DevtoolsState } from "src/types/internal/DevtoolsState";

export const initialDevtoolsState = (initialIsOpen: boolean): DevtoolsState => {
  if (initialIsOpen) {
    return { panel: { state: "OPEN", autoFocus: false }, isPaused: false };
  }

  return {
    panel: { state: "CLOSED", autoFocus: false, closedAfter: 0 },
    isPaused: false,
  };
};
