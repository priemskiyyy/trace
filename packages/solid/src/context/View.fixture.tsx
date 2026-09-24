import type {
  ConsentDecision,
  DestinationStatus,
  TraceStatus,
} from "@priemskiyyy/trace";

import { useConsent } from "src/primitives/useConsent";
import { useDestinationStatus } from "src/primitives/useDestinationStatus";
import { useTraceStatus } from "src/primitives/useTraceStatus";

export const View = (props: {
  onStatus?: (status: TraceStatus) => void;
  onDestination?: (status: DestinationStatus) => void;
  onConsent?: (decisions: Record<string, ConsentDecision>) => void;
}) => {
  const status = useTraceStatus(props.onStatus);
  const destination = useDestinationStatus("product", props.onDestination);
  const consent = useConsent(props.onConsent);

  return (
    <span>{`${status().state}/${destination().state}/${consent().analytics}/${consent().advertising}`}</span>
  );
};
