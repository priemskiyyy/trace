import {
  ArrowsSplit,
  ChartBar,
  ChartLine,
  ChartPieSlice,
  CheckCircle,
  CircleNotch,
  Database,
  GoogleLogo,
  MinusCircle,
  Prohibit,
  Question,
  ShareNetwork,
  XCircle,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import type { BoutiqueDestination } from "example-shared/boutique/reporting/types/BoutiqueDestination";
import type { OutcomeStatus } from "example-shared/boutique/reporting/types/OutcomeStatus";

export const DESTINATION_ICONS: Record<BoutiqueDestination, Icon> = {
  amplitude: ChartBar,
  posthog: ChartLine,
  mixpanel: ChartPieSlice,
  googleAnalytics: GoogleLogo,
  segment: ShareNetwork,
  backend: Database,
};

export const OUTCOME_ICONS: Record<OutcomeStatus, Icon> = {
  pending: CircleNotch,
  submitted: CheckCircle,
  skipped: MinusCircle,
  dropped: Prohibit,
  failed: XCircle,
  indeterminate: Question,
  "not-routed": ArrowsSplit,
};
