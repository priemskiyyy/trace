import type { Accessor } from "solid-js";

import type { PanelPosition } from "src/types/internal/PanelPosition";
import { assertUnreachable } from "src/utils/assertUnreachable";

const MIN_SIZE = 240;
const EDGE_MARGIN = 24;
const KEYBOARD_STEP = 24;

export const useResize = ({
  position,
  size,
  onSizeChange,
}: {
  position: Accessor<PanelPosition>;
  size: Accessor<number>;
  onSizeChange: (size: number) => void;
}) => {
  const getAvailableSpace = () => {
    const current = position();

    if (current === "bottom") {
      return window.innerHeight;
    }

    if (current === "right") {
      return window.innerWidth;
    }

    return assertUnreachable(current);
  };

  const clamp = (value: number) =>
    Math.min(Math.max(value, MIN_SIZE), getAvailableSpace() - EDGE_MARGIN);

  const getDragDistance = (start: PointerEvent, move: PointerEvent) => {
    const current = position();

    if (current === "bottom") {
      return start.clientY - move.clientY;
    }

    if (current === "right") {
      return start.clientX - move.clientX;
    }

    return assertUnreachable(current);
  };

  const getArrowKeys = () => {
    const current = position();

    if (current === "bottom") {
      return { grow: "ArrowUp", shrink: "ArrowDown" };
    }

    if (current === "right") {
      return { grow: "ArrowLeft", shrink: "ArrowRight" };
    }

    return assertUnreachable(current);
  };

  const handlePointerDown = (
    event: PointerEvent & { currentTarget: HTMLElement },
  ) => {
    const handle = event.currentTarget;
    const startSize = size();

    const handlePointerMove = (move: PointerEvent) => {
      onSizeChange(clamp(startSize + getDragDistance(event, move)));
    };

    const handlePointerUp = () => {
      handle.removeEventListener("pointermove", handlePointerMove);
      handle.removeEventListener("pointerup", handlePointerUp);
    };

    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", handlePointerMove);
    handle.addEventListener("pointerup", handlePointerUp);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const { grow, shrink } = getArrowKeys();

    if (event.key === grow) {
      event.preventDefault();
      onSizeChange(clamp(size() + KEYBOARD_STEP));

      return;
    }

    if (event.key === shrink) {
      event.preventDefault();
      onSizeChange(clamp(size() - KEYBOARD_STEP));
    }
  };

  return { handlePointerDown, handleKeyDown };
};
