import type { PanelPosition } from "src/types/internal/PanelPosition";

export type Preferences = {
  isOpen?: boolean;
  position?: PanelPosition;
  height?: number;
  width?: number;
  showValues?: boolean;
};
