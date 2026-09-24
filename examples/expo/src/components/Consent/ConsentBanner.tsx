import { useConsent, useTrace } from "@priemskiyyy/trace-react";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "src/components/Button/Button";

export const ConsentBanner: React.FunctionComponent = () => {
  const trace = useTrace();
  const consent = useConsent();

  const handleAcceptPress = () => {
    trace.consent.set({ analytics: "granted" });
  };

  const handleDeclinePress = () => {
    trace.consent.set({ analytics: "denied" });
  };

  if (consent.analytics !== "unknown") {
    return (
      <Text style={styles.decided}>
        Analytics consent is {consent.analytics}. PostHog, Firebase, Mixpanel
        and Segment{" "}
        {consent.analytics === "granted" ? "receive events" : "receive nothing"}
        .
      </Text>
    );
  }

  return (
    <View aria-label="Consent" role="group" style={styles.pending}>
      <Text style={styles.copy}>
        May Boutique measure how the shop is used? PostHog, Firebase, Mixpanel
        and Segment wait for your answer.
      </Text>
      <View style={styles.actions}>
        <Button label="Decline" onPress={handleDeclinePress} variant="ghost" />
        <Button label="Accept" onPress={handleAcceptPress} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  decided: { fontSize: 13, color: "#52525b" },
  pending: {
    flexDirection: "column",
    gap: 12,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    backgroundColor: "#f5f3ff",
    borderRadius: 14,
    padding: 14,
  },
  copy: { fontSize: 13, color: "#3f3f46" },
  actions: { flexDirection: "row", gap: 8 },
});
