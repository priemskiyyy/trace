import type React from "react";
import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "src/components/EmptyState/EmptyState";
import { Panel } from "src/components/Panel/Panel";
import { DestinationOutcomeRow } from "src/components/Shop/DestinationOutcomeRow";
import { useObservable } from "src/hooks/useObservable";
import type { TrackedReceipt } from "src/types/TrackedReceipt";
import { DESTINATION_NAMES } from "src/utils/constants/destinations";

type LatestReceiptProps = { tracked: TrackedReceipt };

const LatestReceipt: React.FunctionComponent<LatestReceiptProps> = ({
  tracked,
}) => {
  const status = useObservable(tracked.receipt.status);

  return (
    <View style={styles.receipt}>
      <Text style={styles.action}>{tracked.action}</Text>
      {status.state === "dropped" ? (
        <Text style={styles.dropped}>
          Dropped before it reached any destination: {status.reason}.
        </Text>
      ) : (
        <View aria-label="Destinations">
          {DESTINATION_NAMES.map((name) => (
            <DestinationOutcomeRow
              key={name}
              name={name}
              outcome={status.outcomes[name]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

type ReceiptPanelProps = { tracked: TrackedReceipt | null };

export const ReceiptPanel: React.FunctionComponent<ReceiptPanelProps> = ({
  tracked,
}) => (
  <Panel
    title="Latest receipt"
    shows="What every destination did with the last event you tracked, with its evidence and losses."
  >
    {tracked === null ? (
      <EmptyState
        title="Nothing tracked yet"
        description="Add a product to the cart and check out to see a receipt."
      />
    ) : (
      <LatestReceipt tracked={tracked} />
    )}
  </Panel>
);

const styles = StyleSheet.create({
  receipt: { flexDirection: "column", gap: 4 },
  action: { fontSize: 13, color: "#71717a" },
  dropped: { fontSize: 13, color: "#71717a" },
});
