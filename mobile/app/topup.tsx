import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api, ApiError, type PayMethod } from "@/lib/api";
import { errText, tr, useLocale } from "@/lib/i18n-app";
import { CUR_META, fmtMoney, isCur } from "@/lib/money";

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Top-up steps 1 and 2: choose a payment method, then enter the amount. Step 3 (proof) lives on the transaction page. */
export default function TopupScreen() {
  const params = useLocalSearchParams<{ locale?: string }>();
  const L = useLocale(Array.isArray(params.locale) ? params.locale[0] : params.locale);
  const rtl = L === "ar";
  const [methods, setMethods] = useState<PayMethod[] | null>(null);
  const [sel, setSel] = useState<PayMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  useEffect(() => {
    api("config").then((c) => setMethods(c.methods ?? [])).catch(() => setMethods([]));
  }, []);

  const al = { textAlign: rtl ? ("right" as const) : ("left" as const), writingDirection: rtl ? ("rtl" as const) : ("ltr" as const) };
  const row = { flexDirection: rtl ? ("row-reverse" as const) : ("row" as const) };
  const a = Number(amount.replace(",", "."));

  const go = async () => {
    if (!sel || busy) return;
    if (!(a > 0)) return Alert.alert(tr(L, "err"), tr(L, "enterAmount"));
    setBusy(true);
    try {
      const r = await api("deposit_create", { method_id: sel.id, amount: a, idem_key: key.current }, true);
      key.current = newKey();
      router.replace({ pathname: "/transaction", params: { locale: L, txn_id: r.order.txn_id } });
    } catch (e) {
      Alert.alert(tr(L, "err"), errText(L, e instanceof ApiError ? e.code : "network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={tr(L, "topupBtn")} locale={L}>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        {!sel ? (
          <View style={s.card}>
            <Text style={[s.h2, al]}>1 · {tr(L, "chooseMethod")}</Text>
            {methods === null && <ActivityIndicator />}
            {methods?.map((m) => (
              <Pressable key={m.id} onPress={() => setSel(m)} style={[row, { alignItems: "center", gap: 10, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: "#E4E4E4", marginBottom: 8 }]}>
                {m.icon ? <Image source={{ uri: m.icon }} style={{ width: 46, height: 46, borderRadius: 10 }} contentFit="cover" /> : <Ionicons name="wallet-outline" size={36} color="#050505" />}
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontWeight: "800", fontSize: 15 }, al]}>{m.name}</Text>
                  <Text style={[s.muted, al]}>{isCur(m.currency) ? CUR_META[m.currency].flag : ""} {m.currency}</Text>
                </View>
                <Ionicons name={rtl ? "chevron-back" : "chevron-forward"} size={20} color="#999" />
              </Pressable>
            ))}
            {methods?.length === 0 && <Text style={[s.muted, al]}>{tr(L, "noMethods")}</Text>}
          </View>
        ) : (
          <View style={s.card}>
            <Text style={[s.h2, al]}>2 · {tr(L, "enterAmount")}</Text>
            <View style={[row, { alignItems: "center", gap: 10, marginBottom: 12 }]}>
              {sel.icon ? <Image source={{ uri: sel.icon }} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="cover" /> : null}
              <View style={{ flex: 1 }}>
                <Text style={[{ fontWeight: "800" }, al]}>{sel.name}</Text>
                <Text style={[s.muted, al]}>{sel.currency}</Text>
              </View>
              <Pressable onPress={() => setSel(null)}><Text style={{ color: "#0A66C2", fontWeight: "700" }}>{tr(L, "back")}</Text></Pressable>
            </View>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={`${tr(L, "amountLbl")} (${sel.currency})`} placeholderTextColor="#999" style={[s.input, al]} />
            <Text style={[s.muted, al, { marginTop: 8 }]}>
              {tr(L, "minAmt")}: {fmtMoney(sel.min_amount, sel.currency)}{sel.max_amount > 0 ? ` · ${tr(L, "maxAmt")}: ${fmtMoney(sel.max_amount, sel.currency)}` : ""}
            </Text>
            <Pressable disabled={busy} onPress={go} style={[s.btn, { marginTop: 14, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{tr(L, "continue")}</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Page>
  );
}
