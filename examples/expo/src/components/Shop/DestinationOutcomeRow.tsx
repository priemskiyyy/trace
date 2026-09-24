import type { DestinationOutcome } from "@priemskiyyy/trace";
import type { RegisteredDestinationName } from "@priemskiyyy/trace-react";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";

import { OUTCOME_LABELS } from "example-shared/boutique/reporting/constants/labels";
import { getOutcomeStatus } from "example-shared/boutique/reporting/getOutcomeStatus";
import { formatLoss } from "example-shared/formatting/formatLoss";
import { formatOutcome } from "example-shared/formatting/formatOutcome";
import { OUTCOME_TONES } from "example-shared/ui/constants/tones";
import { Badge } from "src/components/Badge/Badge";
import { DESTINATION_GUIDES } from "src/utils/constants/destinations";

type DestinationOutcomeRowProps = {
  name: RegisteredDestinationName;
  outcome: DestinationOutcome | null | undefined;
};

const getLosses = (outcome: DestinationOutcome | null | undefined) => {
  if (outcome === null || outcome === undefined) {
    return [];
  }

  if (outcome.status === "submitted") {
    return outcome.losses;
  }

  if (outcome.status === "dropped" && outcome.reason === "provider-filtered") {
    return outcome.losses;
  }

  return [];
};

export const DestinationOutcomeRow: React.FunctionComponent<
  DestinationOutcomeRowProps
> = ({ name, outcome }) => {
  const status = getOutcomeStatus(outcome);
  const losses = getLosses(outcome);
  const guide = DESTINATION_GUIDES[name];

  return (
    <View aria-label={guide.name} style={styles.row}>
      <View style={styles.heading}>
        <Text style={styles.name}>{guide.name}</Text>
        <Badge tone={OUTCOME_TONES[status]}>{OUTCOME_LABELS[status]}</Badge>
      </View>
      <Text style={styles.text}>{formatOutcome(outcome)}</Text>
      {losses.length === 0 ? null : (
        <View aria-label={`${guide.name} losses`} style={styles.losses}>
          {losses.map((loss) => (
            <Text key={`${loss.path}-${loss.reason}`} style={styles.loss}>
              {formatLoss(loss)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "column",
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 14, fontWeight: "600", color: "#27272a" },
  text: { fontSize: 13, color: "#71717a" },
  losses: { flexDirection: "column", gap: 2 },
  loss: { fontSize: 11, color: "#a1a1aa", fontFamily: "monospace" },
});
