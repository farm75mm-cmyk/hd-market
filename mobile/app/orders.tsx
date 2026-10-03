import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api } from "@/lib/api";
import { tr, useLocale } from "@/lib/i18n-app";

type Order = { id: number; product_name: string; qty: number; total: number; status: string; created_at: number };
const COLORS: Record<string, string> = { new: "#FFF3CD", processing: "#DCEBFF", done: "#E6F4E6", cancelled: "#FDE8E8" };

export default function OrdersScreen() {
  const params = useLocalSearchParams<{ locale?: string }>();
  const L = useLocale(Array.isArray(params.locale) ? params.locale[0] : params.locale);
  const rtl = L === "ar";
  const [orders, setOrders] = useState<Order[]>([]);
  const load = useCallback(async () => {
    try {
      setOrders((await api("orders", {}, true)).orders ?? []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);
  return (
    <Page title={tr(L, "orders")} locale={L}>
      <FlatList
        data={orders}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={{ padding: 14 }}
        ListEmptyComponent={<Text style={[s.muted, { textAlign: "center", marginTop: 40 }]}>{tr(L, "noOrders")}</Text>}
        renderItem={({ item: o }) => (
          <View style={[s.card, { flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View>
              <Text style={{ fontWeight: "800", fontSize: 15, textAlign: rtl ? "right" : "left" }}>#{o.id} · {o.product_name}</Text>
              <Text style={[s.muted, { textAlign: rtl ? "right" : "left" }]}>{tr(L, "qty")}: {o.qty} · {tr(L, "total")}: {o.total}</Text>
              <Text style={[s.muted, { textAlign: rtl ? "right" : "left" }]}>{new Date(o.created_at * 1000).toLocaleString()}</Text>
            </View>
            <Text style={[s.chip, { backgroundColor: COLORS[o.status] ?? "#EEE" }]}>{tr(L, o.status)}</Text>
          </View>
        )}
      />
    </Page>
  );
}
