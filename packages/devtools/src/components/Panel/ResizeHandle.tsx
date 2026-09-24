import { useResize } from "src/hooks/useResize";
import type { PanelPosition } from "src/types/internal/PanelPosition";
import { assertUnreachable } from "src/utils/assertUnreachable";

const getOrientation = (position: PanelPosition) => {
  if (position === "bottom") {
    return "horizontal";
  }

  if (position === "right") {
    return "vertical";
  }

  return assertUnreachable(position);
};

type ResizeHandleProps = {
  position: PanelPosition;
  size: number;
  onSizeChange: (size: number) => void;
};

export const ResizeHandle = (props: ResizeHandleProps) => {
  const { handlePointerDown, handleKeyDown } = useResize({
    position: () => props.position,
    size: () => props.size,
    onSizeChange: (size) => props.onSizeChange(size),
  });

  return (
    <div
      class="resize"
      data-position={props.position}
      role="separator"
      aria-orientation={getOrientation(props.position)}
      aria-label="Resize devtools"
      aria-valuenow={props.size}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  );
};
