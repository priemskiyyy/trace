import type React from "react";
import { StyleSheet, Text, View } from "react-native";

import { TraceStatusBadge } from "src/components/Badge/TraceStatusBadge";

export const Header: React.FunctionComponent = () => (
  <View style={styles.header}>
    <Text style={styles.title}>Boutique</Text>
    <TraceStatusBadge />
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#18181b" },
});
