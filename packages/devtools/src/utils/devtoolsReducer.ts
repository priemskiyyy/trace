import type { DevtoolsAction } from "src/types/internal/DevtoolsAction";
import type { DevtoolsState } from "src/types/internal/DevtoolsState";
import { assertUnreachable } from "src/utils/assertUnreachable";

export const devtoolsReducer = (
  state: DevtoolsState,
  action: DevtoolsAction,
): DevtoolsState => {
  if (action.kind === "OPEN") {
    return { ...state, panel: { state: "OPEN", autoFocus: true } };
  }

  if (action.kind === "CLOSE") {
    return {
      ...state,
      panel: { state: "CLOSED", autoFocus: true, closedAfter: action.after },
    };
  }

  if (action.kind === "TOGGLE_PAUSE") {
    return { ...state, isPaused: !state.isPaused };
  }

  return assertUnreachable(action);
};
