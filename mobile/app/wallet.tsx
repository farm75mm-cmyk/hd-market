import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api, ApiError, type Wallet } from "@/lib/api";
import { getSession } from "@/lib/auth-server";
import { errText, tr, useLocale } from "@/lib/i18n-app";

type Topup = { id: number; wallet_name: string; amount: number; status: string; note?: string | null; created_at: number };

export default function WalletScreen() {
  const params = useLocalSearchParams<{ locale?: string }>();
  const L = useLocale(Array.isArray(params.locale) ? params.locale[0] : params.locale);
  const rtl = L === "ar";
  const [balance, setBalance] = useState(0);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [acc, cfg, t] = await Promise.all([getSession(), api("config"), api("topups", {}, true)]);
      if (acc) setBalance(acc.balance);
      setWallets(cfg.wallets ?? []);
      setTopups(t.topups ?? []);
    } catch {
      /* offline gate handles connectivity */
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (r.canceled) return;
    try {
      const m = await ImageManipulator.manipulateAsync(r.assets[0].uri, [{ resize: { width: 900 } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      setReceipt(`data:image/jpeg;base64,${m.base64}`);
    } catch {
      Alert.alert(tr(L, "err"), tr(L, "invalid"));
    }
  };

  const copy = async (w: Wallet) => {
    await Clipboard.setStringAsync(w.number);
    setCopied(w.id);
    setTimeout(() => setCopied(null), 1500);
  };

  const submit = async () => {
    const a = Number(amount.replace(",", "."));
    if (!sel || !receipt || !(a > 0)) return Alert.alert(tr(L, "err"), tr(L, "needAmount"));
    setBusy(true);
    try {
      await api("topup_create", { wallet_id: sel, amount: a, receipt }, true);
      setAmount("");
      setReceipt(null);
      Alert.alert(tr(L, "topup"), tr(L, "sent"));
      await load();
    } catch (e) {
      Alert.alert(tr(L, "err"), errText(L, e instanceof ApiError ? e.code : "network"));
    } finally {
      setBusy(false);
    }
  };

  const al = { textAlign: rtl ? ("right" as const) : ("left" as const), writingDirection: rtl ? ("rtl" as const) : ("ltr" as const) };
  return (
    <Page title={tr(L, "wallet")} locale={L} right={<Pressable onPress={() => router.push({ pathname: "/orders", params: { locale: L } })}><Ionicons name="receipt-outline" size={26} color="#050505" /></Pressable>}>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <View style={[s.card, { backgroundColor: "#000" }]}>
          <Text style={{ color: "#BBB", ...al }}>{tr(L, "balance")}</Text>
          <Text style={{ color: "#fff", fontSize: 34, fontWeight: "900", ...al }}>{balance.toFixed(2)}</Text>
        </View>

        <View style={s.card}>
          <Text style={[s.h2, al]}>{tr(L, "chooseWallet")}</Text>
          {wallets.map((w) => (
            <Pressable key={w.id} onPress={() => setSel(w.id)} style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: sel === w.id ? "#000" : "#E4E4E4", marginBottom: 8 }}>
              {w.icon ? <Image source={{ uri: w.icon }} style={{ width: 46, height: 46, borderRadius: 10 }} contentFit="cover" /> : <Ionicons name="wallet-outline" size={36} color="#050505" />}
              <View style={{ flex: 1 }}>
                <Text style={[{ fontWeight: "800", fontSize: 15 }, al]}>{w.name}</Text>
                <Text style={[s.muted, { textAlign: rtl ? "right" : "left" }]}>{tr(L, "payNumber")}: <Text selectable style={{ color: "#050505", fontWeight: "700" }}>{w.number}</Text></Text>
              </View>
              <Pressable onPress={() => copy(w)} style={[s.btn, { height: 38, paddingHorizontal: 12, backgroundColor: copied === w.id ? "#22C55E" : "#000" }]}>
                <Text style={[s.btnText, { fontSize: 13 }]}>{copied === w.id ? tr(L, "copied") : tr(L, "copy")}</Text>
              </Pressable>
            </Pressable>
          ))}
          {!wallets.length && <ActivityIndicator />}
        </View>

        <View style={s.card}>
          <Text style={[s.h2, al]}>{tr(L, "topup")}</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={tr(L, "amount")} placeholderTextColor="#999" style={[s.input, al]} />
          <Pressable onPress={pick} style={[s.btn, { backgroundColor: "#F0F0F0", marginTop: 10 }]}>
            <Text style={[s.btnText, { color: "#050505" }]}>{tr(L, "pickReceipt")}</Text>
          </Pressable>
          {receipt && <Image source={{ uri: receipt }} style={{ width: "100%", height: 200, borderRadius: 12, marginTop: 10 }} contentFit="contain" />}
          <Pressable disabled={busy} onPress={submit} style={[s.btn, { marginTop: 10, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{tr(L, "send")}</Text>}
          </Pressable>
        </View>

        <View style={s.card}>
          <Text style={[s.h2, al]}>{tr(L, "history")}</Text>
          {topups.map((t) => (
            <View key={t.id} style={{ flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#EEE" }}>
              <View>
                <Text style={{ fontWeight: "700", ...al }}>{t.amount} · {t.wallet_name}</Text>
                {t.note ? <Text style={[s.muted, al]}>{t.note}</Text> : null}
              </View>
              <Text style={[s.chip, { backgroundColor: t.status === "approved" ? "#E6F4E6" : t.status === "rejected" ? "#FDE8E8" : "#FFF3CD" }]}>{tr(L, t.status)}</Text>
            </View>
          ))}
          {!topups.length && <Text style={[s.muted, al]}>{tr(L, "noTopups")}</Text>}
        </View>
      </ScrollView>
    </Page>
  );
}
