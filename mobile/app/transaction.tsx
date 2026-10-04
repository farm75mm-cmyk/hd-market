import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api, ApiError, type PayMethod } from "@/lib/api";
import { errText, tr, useLocale } from "@/lib/i18n-app";
import { fmtMoney, STATUS_COLOR, stamp } from "@/lib/money";

type Order = { id: number; txn_id: string; user_id: number; method_id: number; method_name: string; currency: string; amount: number; paid_amount: number | null; credit_amount: number | null; status: string; reject_reason: string | null; balance_before: number | null; balance_after: number | null; created_at: number; updated_at: number; expires_at: number; rate_usdt: number };
type Hist = { from_status: string | null; to_status: string; actor: string; note: string | null; created_at: number };
type Detail =
  | { kind: "deposit"; order: Order; proof: string | null; history: Hist[] }
  | { kind: "txn"; txn: { txn_id: string; type: string; currency: string; amount: number; balance_before: number; balance_after: number; ref_txn_id: string | null; note: string; user_id: number; created_at: number } };

export default function TransactionScreen() {
  const params = useLocalSearchParams<{ locale?: string; txn_id?: string }>();
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const L = useLocale(one(params.locale));
  const txn = one(params.txn_id) ?? "";
  const rtl = L === "ar";
  const [d, setD] = useState<Detail | null>(null);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<Detail>("transaction_get", { txn_id: txn }, true);
      setD(r);
    } catch {
      /* ignore */
    }
  }, [txn]);
  useEffect(() => {
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const order = d?.kind === "deposit" ? d.order : null;
  useEffect(() => {
    if (!order || order.status !== "awaiting_payment" || method?.id === order.method_id) return;
    api("config").then((c) => setMethod((c.methods ?? []).find((m: PayMethod) => m.id === order.method_id) ?? null)).catch(() => undefined);
  }, [order, method]);
  useEffect(() => {
    if (!order || order.status !== "awaiting_payment") return;
    const tick = () => setLeft(Math.max(0, order.expires_at - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order]);

  const al = { textAlign: rtl ? ("right" as const) : ("left" as const), writingDirection: rtl ? ("rtl" as const) : ("ltr" as const) };
  const row = { flexDirection: rtl ? ("row-reverse" as const) : ("row" as const) };
  const copy = async (k: string, v: string) => { await Clipboard.setStringAsync(v); setCopied(k); setTimeout(() => setCopied(""), 1500); };
  const F = ({ k, v, copyable }: { k: string; v: string; copyable?: boolean }) => (
    <View style={[row, { justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#EEE", gap: 10 }]}>
      <Text style={[s.muted, { flexShrink: 0 }]}>{k}</Text>
      <View style={[row, { flex: 1, justifyContent: "flex-end", alignItems: "center", gap: 8 }]}>
        <Text selectable style={{ fontWeight: "700", color: "#050505", flexShrink: 1, textAlign: rtl ? "left" : "right" }}>{v}</Text>
        {copyable ? <Pressable onPress={() => copy(k, v)}><Text style={{ color: copied === k ? "#22C55E" : "#0A66C2", fontWeight: "700", fontSize: 12 }}>{copied === k ? tr(L, "copied") : tr(L, "copy")}</Text></Pressable> : null}
      </View>
    </View>
  );

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (r.canceled) return;
    try {
      const m = await ImageManipulator.manipulateAsync(r.assets[0].uri, [{ resize: { width: 900 } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      setProof(`data:image/jpeg;base64,${m.base64}`);
    } catch {
      Alert.alert(tr(L, "err"), tr(L, "invalid"));
    }
  };
  const send = async () => {
    if (!order || busy) return;
    if (!proof) return Alert.alert(tr(L, "err"), tr(L, "needProof"));
    setBusy(true);
    try {
      await api("deposit_proof", { order_id: order.id, proof }, true);
      setProof(null);
      Alert.alert(tr(L, "topupBtn"), tr(L, "proofSentMsg"));
      await load();
    } catch (e) {
      Alert.alert(tr(L, "err"), errText(L, e instanceof ApiError ? e.code : "network"));
      await load();
    } finally {
      setBusy(false);
    }
  };
  const cancel = () =>
    Alert.alert(tr(L, "cancelOrder"), tr(L, "confirmCancel"), [
      { text: tr(L, "back"), style: "cancel" },
      { text: tr(L, "cancelOrder"), style: "destructive", onPress: async () => { try { await api("deposit_cancel", { order_id: order!.id }, true); await load(); } catch (e) { Alert.alert(tr(L, "err"), errText(L, e instanceof ApiError ? e.code : "network")); } } },
    ]);

  const mmss = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  return (
    <Page title={tr(L, "details")} locale={L}>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        {!d && <ActivityIndicator style={{ marginTop: 40 }} />}

        {order && order.status === "awaiting_payment" && (
          <View style={[s.card, { borderColor: "#E8A900", borderWidth: 2 }]}>
            <Text style={[s.h2, al]}>3 · {tr(L, "payInfo")}</Text>
            <F k={tr(L, "amountToTransfer")} v={`${fmtMoney(order.amount, order.currency)} ${order.currency}`} copyable />
            <F k={tr(L, "method")} v={order.method_name} />
            {method ? <F k={tr(L, "payInfo")} v={method.info} copyable /> : <ActivityIndicator />}
            {method?.instructions ? <Text style={[s.muted, al, { marginTop: 8 }]}>{tr(L, "instructions")}: {method.instructions}</Text> : null}
            <Text style={[al, { marginTop: 10, fontWeight: "800", color: left > 0 ? "#050505" : "#B71C1C" }]}>{left > 0 ? `${tr(L, "expiresIn")}: ${mmss}` : tr(L, "expiredNote")}</Text>
            {left > 0 && (
              <>
                <Pressable onPress={pick} style={[s.btn, { backgroundColor: "#F0F0F0", marginTop: 12 }]}><Text style={[s.btnText, { color: "#050505" }]}>{tr(L, "uploadProof")}</Text></Pressable>
                {proof && <Image source={{ uri: proof }} style={{ width: "100%", height: 200, borderRadius: 12, marginTop: 10 }} contentFit="contain" />}
                <Pressable disabled={busy} onPress={send} style={[s.btn, { marginTop: 10, opacity: busy ? 0.6 : 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{tr(L, "sendProof")}</Text>}</Pressable>
                <Pressable onPress={cancel} style={{ alignItems: "center", marginTop: 12 }}><Text style={{ color: "#B71C1C", fontWeight: "700" }}>{tr(L, "cancelOrder")}</Text></Pressable>
              </>
            )}
          </View>
        )}

        {d?.kind === "deposit" && (
          <>
            <View style={s.card}>
              <View style={[row, { justifyContent: "space-between", alignItems: "center", marginBottom: 6 }]}>
                <Text style={[s.h2, { marginBottom: 0 }]}>{tr(L, "type_deposit")}</Text>
                <Text style={[s.chip, { backgroundColor: STATUS_COLOR[d.order.status] ?? "#EEE" }]}>{tr(L, "st_" + d.order.status)}</Text>
              </View>
              <F k={tr(L, "txnId")} v={d.order.txn_id} copyable />
              <F k={tr(L, "userId")} v={String(d.order.user_id)} />
              <F k={tr(L, "amountLbl")} v={`${fmtMoney(d.order.amount, d.order.currency)} ${d.order.currency}`} />
              {d.order.paid_amount != null && <F k={tr(L, "paidAmount")} v={`${fmtMoney(d.order.paid_amount, d.order.currency)} ${d.order.currency}`} />}
              <F k={tr(L, "method")} v={d.order.method_name} />
              <F k={tr(L, "fixedRate")} v={`1 USDT = ${d.order.rate_usdt} ${d.order.currency}`} />
              <F k={tr(L, "createdAt")} v={`${stamp(d.order.created_at).date}  ${stamp(d.order.created_at).time}`} />
              <F k={tr(L, "updated")} v={`${stamp(d.order.updated_at).date}  ${stamp(d.order.updated_at).time}`} />
              {d.order.balance_before != null && <F k={tr(L, "balBefore")} v={`${fmtMoney(d.order.balance_before, d.order.currency)} ${d.order.currency}`} />}
              {d.order.balance_after != null && <F k={tr(L, "balAfter")} v={`${fmtMoney(d.order.balance_after, d.order.currency)} ${d.order.currency}`} />}
              {d.order.reject_reason ? <F k={tr(L, "reason")} v={d.order.reject_reason} /> : null}
            </View>
            {d.proof ? (
              <View style={s.card}>
                <Text style={[s.h2, al]}>{tr(L, "proof")}</Text>
                <Image source={{ uri: d.proof }} style={{ width: "100%", height: 260, borderRadius: 12 }} contentFit="contain" />
              </View>
            ) : null}
            <View style={s.card}>
              <Text style={[s.h2, al]}>{tr(L, "statusLog")}</Text>
              {d.history.map((h, i) => {
                const t = stamp(h.created_at);
                return (
                  <View key={i} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#EEE" }}>
                    <Text style={[{ fontWeight: "700" }, al]}>{tr(L, "st_" + h.to_status)}</Text>
                    <Text style={[s.muted, al]}>{t.date} · {t.time} · {tr(L, "actor_" + h.actor)}{h.note ? ` · ${h.note}` : ""}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {d?.kind === "txn" && (
          <View style={s.card}>
            <Text style={[s.h2, al]}>{tr(L, "type_" + d.txn.type)}</Text>
            <F k={tr(L, "txnId")} v={d.txn.txn_id} copyable />
            <F k={tr(L, "userId")} v={String(d.txn.user_id)} />
            <F k={tr(L, "amountLbl")} v={`${d.txn.amount < 0 ? "−" : "+"}${fmtMoney(Math.abs(d.txn.amount), d.txn.currency)} ${d.txn.currency}`} />
            {d.txn.note ? <F k={tr(L, "details")} v={d.txn.note} /> : null}
            {d.txn.ref_txn_id ? <F k={tr(L, "txnId") + " ↩"} v={d.txn.ref_txn_id} copyable /> : null}
            <F k={tr(L, "date")} v={stamp(d.txn.created_at).date} />
            <F k={tr(L, "time")} v={stamp(d.txn.created_at).time} />
            <F k={tr(L, "balBefore")} v={`${fmtMoney(d.txn.balance_before, d.txn.currency)} ${d.txn.currency}`} />
            <F k={tr(L, "balAfter")} v={`${fmtMoney(d.txn.balance_after, d.txn.currency)} ${d.txn.currency}`} />
          </View>
        )}
      </ScrollView>
    </Page>
  );
}
