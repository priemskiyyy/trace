import type { TraceStatus } from "@priemskiyyy/trace";

import { TraceIcon } from "src/components/TraceIcon";
import { useAutoFocus } from "src/hooks/useAutoFocus";

const getDotState = (hasUnseenError: boolean, status: TraceStatus) => {
  if (hasUnseenError) {
    return "error";
  }

  return status.state;
};

type LauncherProps = {
  status: TraceStatus;
  hasUnseenError: boolean;
  autoFocus: boolean;
  onOpen: () => void;
};

export const Launcher = (props: LauncherProps) => {
  const focusOnMount = useAutoFocus(props.autoFocus);

  return (
    <button
      ref={focusOnMount}
      type="button"
      class="launcher"
      aria-label="Open Trace devtools"
      onClick={() => props.onOpen()}
    >
      <TraceIcon />
      <span>Trace</span>
      <span
        class="dot"
        data-state={getDotState(props.hasUnseenError, props.status)}
      />
    </button>
  );
};
