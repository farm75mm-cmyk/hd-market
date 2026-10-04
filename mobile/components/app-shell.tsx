import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { tr, type L } from "@/lib/i18n-app";
import { useClock } from "@/lib/money";

/** Simple page frame used by the wallet / support / orders / category screens. */
export function Page({ title, locale, children, right }: { title: string; locale: L; children: ReactNode; right?: ReactNode }) {
  const rtl = locale === "ar";
  const clock = useClock();
  return (
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={[s.head, rtl && { flexDirection: "row-reverse" }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr(locale, "back")} onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/store", params: { locale } }))} style={s.back}>
          <Ionicons name={rtl ? "arrow-forward" : "arrow-back"} size={24} color="#050505" />
        </Pressable>
        <Text style={[s.title, { flex: 1, textAlign: rtl ? "right" : "left", marginHorizontal: 10 }]} numberOfLines={1}>{title}</Text>
        <View style={{ alignItems: "center", marginHorizontal: 8 }}>
          <Text style={s.clockD}>{clock.date}</Text>
          <Text style={s.clockT}>{clock.time}</Text>
        </View>
        <View style={{ minWidth: 40, alignItems: "center" }}>{right}</View>
      </View>
      <View style={s.body}>{children}</View>
    </SafeAreaView>
  );
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FAFAFA" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, height: 60, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E4E4E4" },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F0F0" },
  title: { fontSize: 19, fontWeight: "800", color: "#050505" },
  clockD: { fontSize: 13, lineHeight: 17, fontWeight: "800", color: "#050505" },
  clockT: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: "#555" },
  body: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#E4E4E4", marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: "800", color: "#050505", marginBottom: 10 },
  input: { height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: "#DDD", paddingHorizontal: 12, fontSize: 16, backgroundColor: "#fff", color: "#050505" },
  btn: { height: 48, borderRadius: 14, backgroundColor: "#000", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  muted: { color: "#7C7C7C", fontSize: 13 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: "#EEE", overflow: "hidden", fontSize: 12, fontWeight: "700" },
});
