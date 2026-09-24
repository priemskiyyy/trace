import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import type { Accessor } from "solid-js";

import { Launcher } from "src/components/Launcher";
import { DevtoolsPanel } from "src/components/Panel/DevtoolsPanel";
import { useObservableValue } from "src/hooks/useObservableValue";
import { useStoredValue } from "src/hooks/useStoredValue";
import { styles } from "src/styles";
import type { DevtoolsAction } from "src/types/internal/DevtoolsAction";
import type { ObservedTrace } from "src/types/internal/ObservedTrace";
import type { PanelPosition } from "src/types/internal/PanelPosition";
import { assertUnreachable } from "src/utils/assertUnreachable";
import { devtoolsReducer } from "src/utils/devtoolsReducer";
import type { EventLog } from "src/utils/EventLog";
import { initialDevtoolsState } from "src/utils/initialDevtoolsState";
import { parsePreferences } from "src/utils/parsePreferences";

const DEFAULT_SIZE = { bottom: 420, right: 520 } satisfies Record<
  PanelPosition,
  number
>;

const PREFERENCES_KEY = "@priemskiyyy/trace-devtools";

type DevtoolsProps = {
  trace: Accessor<ObservedTrace>;
  maxEvents: Accessor<number>;
  initialIsOpen: boolean;
  log: EventLog;
};

export const Devtools = (props: DevtoolsProps) => {
  const [preferences, setPreferences] = useStoredValue(
    PREFERENCES_KEY,
    parsePreferences,
    {},
  );

  const [state, setState] = createSignal(
    initialDevtoolsState(preferences().isOpen ?? props.initialIsOpen),
  );

  const snapshot = useObservableValue(() => props.trace().diagnostics);
  const events = useObservableValue(() => props.log);
  const panel = createMemo(() => state().panel);
  const isPaused = createMemo(() => state().isPaused);
  const position = createMemo(() => preferences().position ?? "bottom");
  const showValues = createMemo(() => preferences().showValues ?? false);

  const size = createMemo(() => {
    const { height, width } = preferences();
    const current = position();

    if (current === "bottom") {
      return height ?? DEFAULT_SIZE.bottom;
    }

    if (current === "right") {
      return width ?? DEFAULT_SIZE.right;
    }

    return assertUnreachable(current);
  });

  const hasUnseenError = createMemo(() => {
    const current = panel();

    if (current.state !== "CLOSED") {
      return false;
    }

    return events().some(
      (event) => event.kind === "ERROR" && event.id > current.closedAfter,
    );
  });

  const dispatch = (action: DevtoolsAction) => {
    setState((current) => devtoolsReducer(current, action));
  };

  const handleSizeChange = (next: number) => {
    const current = position();

    if (current === "bottom") {
      setPreferences({ ...preferences(), height: next });

      return;
    }

    if (current === "right") {
      setPreferences({ ...preferences(), width: next });

      return;
    }

    assertUnreachable(current);
  };

  const handleDock = () => {
    const current = position();

    if (current === "bottom") {
      setPreferences({ ...preferences(), position: "right" });

      return;
    }

    if (current === "right") {
      setPreferences({ ...preferences(), position: "bottom" });

      return;
    }

    assertUnreachable(current);
  };

  const handleShowValuesChange = (next: boolean) => {
    setPreferences({ ...preferences(), showValues: next });
  };

  const handleClose = () => {
    dispatch({ kind: "CLOSE", after: events()[0]?.id ?? 0 });
  };

  createEffect(() => {
    props.log.setLimit(props.maxEvents());
  });

  createEffect(() => {
    if (isPaused()) {
      return;
    }

    const trace = props.trace();

    onCleanup(trace.diagnostics.events.subscribe(props.log.add));
    onCleanup(trace.events.subscribe(props.log.accept));
  });

  // Only the panel state is tracked here; reading the preferences would re-run this on its own write.
  createEffect(() => {
    const isOpen = panel().state === "OPEN";

    setPreferences({ ...untrack(preferences), isOpen });
  });

  return (
    <div class="root" data-trace-devtools="">
      <style>{styles}</style>
      {(() => {
        const current = panel();

        if (current.state === "OPEN") {
          return (
            <DevtoolsPanel
              snapshot={snapshot()}
              events={events()}
              isPaused={isPaused()}
              showValues={showValues()}
              autoFocus={current.autoFocus}
              position={position()}
              size={size()}
              onSizeChange={handleSizeChange}
              onDock={handleDock}
              onTogglePause={() => dispatch({ kind: "TOGGLE_PAUSE" })}
              onShowValuesChange={handleShowValuesChange}
              onClear={props.log.clear}
              onClose={handleClose}
            />
          );
        }

        if (current.state === "CLOSED") {
          return (
            <Launcher
              status={snapshot().status}
              hasUnseenError={hasUnseenError()}
              autoFocus={current.autoFocus}
              onOpen={() => dispatch({ kind: "OPEN" })}
            />
          );
        }

        return assertUnreachable(current);
      })()}
    </div>
  );
};
