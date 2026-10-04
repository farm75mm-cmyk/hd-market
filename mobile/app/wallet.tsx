import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api, type HistoryItem } from "@/lib/api";
import { tr, useLocale } from "@/lib/i18n-app";
import { ACTIVE_DEPOSIT, CURS, CUR_META, fmtMoney, STATUS_COLOR, stamp, useCurrency, type Cur } from "@/lib/money";

export default function WalletScreen() {
  const params = useLocalSearchParams<{ locale?: string }>();
  const L = useLocale(Array.isArray(params.locale) ? params.locale[0] : params.locale);
  const rtl = L === "ar";
  const [cur, setCur] = useCurrency();
  const [balances, setBalances] = useState<Record<string, number>>({ JOD: 0, IQD: 0, USDT: 0 });
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, h] = await Promise.all([api("wallet_overview", {}, true), api("wallet_history", {}, true)]);
      setBalances(o.balances ?? {});
      setItems(h.items ?? []);
    } catch {
      /* offline gate handles connectivity */
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const open = (txn: string) => router.push({ pathname: "/transaction", params: { locale: L, txn_id: txn } });
  const active = items.filter((i) => i.kind === "deposit" && ACTIVE_DEPOSIT.includes(i.status));
  const history = items.filter((i) => !(i.kind === "deposit" && ACTIVE_DEPOSIT.includes(i.status)));
  const al = { textAlign: rtl ? ("right" as const) : ("left" as const), writingDirection: rtl ? ("rtl" as const) : ("ltr" as const) };
  const row = { flexDirection: rtl ? ("row-reverse" as const) : ("row" as const) };

  const Row = ({ i }: { i: HistoryItem }) => {
    const st = stamp(i.created_at);
    const sign = i.amount > 0 ? "+" : i.amount < 0 ? "−" : "";
    const label = i.kind === "deposit" ? `${tr(L, "type_deposit")} · ${i.title}` : `${tr(L, "type_" + i.type)}${i.title ? " · " + i.title : ""}`;
    return (
      <Pressable onPress={() => open(i.txn_id)} style={({ pressed }) => [{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEE", opacity: pressed ? 0.6 : 1 }]}>
        <View style={[row, { justifyContent: "space-between", alignItems: "center" }]}>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontWeight: "800", fontSize: 14 }, al]} numberOfLines={1}>{label}</Text>
            <Text style={[s.muted, al]}>{st.date} · {st.time}</Text>
            <Text style={[s.muted, al]} selectable={false} numberOfLines={1}>{i.txn_id}</Text>
          </View>
          <View style={{ alignItems: rtl ? "flex-start" : "flex-end", marginHorizontal: 8 }}>
            <Text style={{ fontWeight: "900", fontSize: 15, color: i.amount < 0 ? "#B71C1C" : "#1B6B1B" }}>{sign}{fmtMoney(Math.abs(i.amount), i.currency)} {i.currency}</Text>
            <Text style={[s.chip, { backgroundColor: STATUS_COLOR[i.status] ?? "#EEE", marginTop: 4 }]}>{tr(L, "st_" + i.status)}</Text>
          </View>
        </View>
        {i.balance_before != null && i.balance_after != null ? (
          <Text style={[s.muted, al, { marginTop: 4 }]}>{tr(L, "balBefore")}: {fmtMoney(i.balance_before, i.currency)} → {tr(L, "balAfter")}: {fmtMoney(i.balance_after, i.currency)}</Text>
        ) : null}
        {i.reject_reason ? <Text style={[{ color: "#B71C1C", fontSize: 12, marginTop: 4 }, al]}>{tr(L, "reason")}: {i.reject_reason}</Text> : null}
      </Pressable>
    );
  };

  return (
    <Page title={tr(L, "wallet")} locale={L} right={<Pressable onPress={() => router.push({ pathname: "/orders", params: { locale: L } })}><Ionicons name="receipt-outline" size={26} color="#050505" /></Pressable>}>
      <ScrollView contentContainerStyle={{ padding: 14 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={[row, { gap: 8, marginBottom: 12 }]}>
          {CURS.map((c) => (
            <Pressable key={c} onPress={() => setCur(c as Cur)} style={{ flex: 1, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: cur === c ? "#000" : "#E4E4E4", backgroundColor: cur === c ? "#000" : "#fff", alignItems: "center" }}>
              <Text style={{ fontSize: 18 }}>{CUR_META[c].flag}</Text>
              <Text style={{ fontWeight: "800", fontSize: 13, color: cur === c ? "#fff" : "#050505" }}>{c === "IQD" ? "IQ MasterCard" : c}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[s.card, { backgroundColor: "#000" }]}>
          <Text style={{ color: "#BBB", ...al }}>{tr(L, "balance")} · {CUR_META[cur][rtl ? "ar" : "en"]}</Text>
          <Text style={{ color: "#fff", fontSize: 36, fontWeight: "900", ...al }}>{fmtMoney(balances[cur] ?? 0, cur)} <Text style={{ fontSize: 16 }}>{cur}</Text></Text>
          <View style={[row, { gap: 14, marginTop: 8, flexWrap: "wrap" }]}>
            {CURS.filter((c) => c !== cur).map((c) => <Text key={c} style={{ color: "#999", fontSize: 12 }}>{c}: {fmtMoney(balances[c] ?? 0, c)}</Text>)}
          </View>
          <Pressable onPress={() => router.push({ pathname: "/topup", params: { locale: L } })} style={[s.btn, { backgroundColor: "#E8A900", marginTop: 14 }]}>
            <Text style={[s.btnText, { color: "#111" }]}>＋ {tr(L, "topupBtn")}</Text>
          </Pressable>
        </View>

        <View style={s.card}>
          <Text style={[s.h2, al]}>{tr(L, "activeTopups")}</Text>
          {active.map((i) => <Row key={i.txn_id} i={i} />)}
          {!active.length && <Text style={[s.muted, al]}>{tr(L, "noActive")}</Text>}
        </View>

        <View style={s.card}>
          <Text style={[s.h2, al]}>{tr(L, "opHistory")}</Text>
          {history.map((i) => <Row key={i.txn_id} i={i} />)}
          {!history.length && <Text style={[s.muted, al]}>{tr(L, "noOps")}</Text>}
        </View>
      </ScrollView>
    </Page>
  );
}
