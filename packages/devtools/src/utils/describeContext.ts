import type { TraceDiagnosticEvent } from "@priemskiyyy/trace";

import { formatContextSummary } from "src/formatting/formatContextSummary";
import { formatContextText } from "src/formatting/formatContextText";
import type { DescribedContext } from "src/types/internal/DescribedContext";
import { getContextLosses } from "src/utils/getContextLosses";
import { getContextNames } from "src/utils/getContextNames";
import { getEventKind } from "src/utils/getEventKind";
import { inspectContext } from "src/utils/inspectContext";

export const describeContext = (
  event: TraceDiagnosticEvent,
): DescribedContext => {
  const kind = getEventKind(event);

  try {
    const value = inspectContext(event.context);

    return {
      context: formatContextText(value),
      summary: formatContextSummary(value),
      kind,
      losses: getContextLosses(value),
      destinations: getContextNames(value, "destinations"),
    };
  } catch {
    return {
      context: "[Unable to inspect this value]",
      summary: "",
      kind,
      losses: [],
      destinations: [],
    };
  }
};
