import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { errText, tr, useLocale } from "@/lib/i18n-app";
import { fmtMoney, fromJod, useCurrency } from "@/lib/money";

type Product = { id: number; category_id: number; name: string; image: string | null; price: number; qty: number; pack?: number; max_order?: number };
const capOf = (p: { qty: number; max_order?: number }) => ((p.max_order ?? 0) > 0 ? Math.min(p.qty, p.max_order as number) : p.qty);

export default function CategoryScreen() {
  const params = useLocalSearchParams<{ locale?: string; id?: string; name?: string }>();
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const L = useLocale(one(params.locale));
  const rtl = L === "ar";
  const cid = Number(one(params.id));
  const [products, setProducts] = useState<Product[]>([]);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [cur] = useCurrency();
  const [rates, setRates] = useState<Record<string, number>>({});
  const money = (jod: number) => `${fmtMoney(fromJod(jod, cur, rates), cur)} ${cur}`;

  const load = useCallback(async () => {
    try {
      const [d, cfg] = await Promise.all([api("catalog"), api("config").catch(() => null)]);
      if (cfg?.rates) setRates(cfg.rates);
      setProducts((d.products as Product[]).filter((p) => p.category_id === cid));
    } catch {
      /* ignore */
    }
  }, [cid]);
  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const buy = (p: Product) => {
    const n = qty[p.id] ?? 1;
    Alert.alert(p.name, `${tr(L, "confirmBuy")}\n${tr(L, "qty")}: ${n}\n${tr(L, "total")}: ${money(p.price * n)}`, [
      { text: tr(L, "back"), style: "cancel" },
      {
        text: tr(L, "buy"),
        onPress: async () => {
          setBusy(p.id);
          try {
            await api("order_create", { product_id: p.id, qty: n, currency: cur }, true);
            Alert.alert(tr(L, "orders"), tr(L, "bought"));
            setQty((q) => ({ ...q, [p.id]: 1 }));
            await load();
          } catch (e) {
            Alert.alert(tr(L, "err"), errText(L, e instanceof ApiError ? e.code : "network"));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <Page title={one(params.name) ?? ""} locale={L}>
      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 14 }}
        ListEmptyComponent={<Text style={[s.muted, { textAlign: "center", marginTop: 40 }]}>{tr(L, "noProducts")}</Text>}
        renderItem={({ item: p }) => {
          const n = qty[p.id] ?? 1;
          return (
            <View style={[s.card, { flexDirection: rtl ? "row-reverse" : "row", gap: 12, alignItems: "center" }]}>
              {p.image ? <Image source={{ uri: p.image }} style={{ width: 84, height: 84, borderRadius: 12 }} contentFit="cover" /> : <View style={{ width: 84, height: 84, borderRadius: 12, backgroundColor: "#EEE" }} />}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 16, textAlign: rtl ? "right" : "left" }}>{p.name}</Text>
                <Text style={[s.muted, { textAlign: rtl ? "right" : "left" }]}>{tr(L, "price")}: <Text style={{ color: "#050505", fontWeight: "800" }}>{money(p.price)}</Text> · {tr(L, "qty")}: {p.qty}{(p.pack ?? 1) > 1 ? ` · ${tr(L, "pack")}: ${p.pack}` : ""}</Text>
                {(p.max_order ?? 0) > 0 ? <Text style={{ alignSelf: rtl ? "flex-end" : "flex-start", backgroundColor: "#FFF3CD", color: "#7A5B00", fontSize: 12, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, overflow: "hidden" }}>{tr(L, "limit")}: {p.max_order}</Text> : null}
                {p.qty > 0 ? (
                  <View style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <Pressable onPress={() => setQty((q) => ({ ...q, [p.id]: Math.max(1, n - 1) }))} style={[s.btn, { width: 36, height: 36, paddingHorizontal: 0, backgroundColor: "#EEE" }]}><Text style={{ fontSize: 20 }}>−</Text></Pressable>
                    <Text style={{ fontWeight: "800", minWidth: 24, textAlign: "center" }}>{n}</Text>
                    <Pressable onPress={() => setQty((q) => ({ ...q, [p.id]: Math.min(capOf(p), n + 1) }))} style={[s.btn, { width: 36, height: 36, paddingHorizontal: 0, backgroundColor: "#EEE" }]}><Text style={{ fontSize: 20 }}>+</Text></Pressable>
                    <Pressable disabled={busy === p.id} onPress={() => buy(p)} style={[s.btn, { height: 38, flex: 1, opacity: busy === p.id ? 0.6 : 1 }]}><Text style={s.btnText}>{tr(L, "buy")}</Text></Pressable>
                  </View>
                ) : (
                  <Text style={[s.chip, { backgroundColor: "#FDE8E8", alignSelf: rtl ? "flex-end" : "flex-start", marginTop: 8 }]}>{tr(L, "soldOut")}</Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </Page>
  );
}
