import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";
import { errText, tr, useLocale } from "@/lib/i18n-app";

type Msg = { id: number; sender: "user" | "admin"; body: string; created_at: number };

export default function SupportScreen() {
  const params = useLocalSearchParams<{ locale?: string }>();
  const L = useLocale(Array.isArray(params.locale) ? params.locale[0] : params.locale);
  const rtl = L === "ar";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<Msg>>(null);

  const load = useCallback(async () => {
    try {
      setMsgs((await api("support_list", {}, true)).messages ?? []);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
  }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await api("support_send", { body }, true);
      setText("");
      await load();
    } catch (e) {
      Alert.alert(tr(L, "err"), errText(L, e instanceof ApiError ? e.code : "network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={tr(L, "support")} locale={L}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1 }}
          ListEmptyComponent={<Text style={[s.muted, { textAlign: "center", marginTop: 40 }]}>{tr(L, "noMsgs")}</Text>}
          renderItem={({ item: m }) => {
            const mine = m.sender === "user";
            return (
              <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", backgroundColor: mine ? "#000" : "#fff", borderWidth: mine ? 0 : 1, borderColor: "#E4E4E4", borderRadius: 16, paddingVertical: 9, paddingHorizontal: 13 }}>
                <Text style={{ color: mine ? "#fff" : "#050505", fontSize: 15, textAlign: rtl ? "right" : "left" }}>{m.body}</Text>
                <Text style={{ color: mine ? "#AAA" : "#999", fontSize: 11, marginTop: 3 }}>{new Date(m.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
              </View>
            );
          }}
        />
        <View style={{ flexDirection: rtl ? "row-reverse" : "row", gap: 8, padding: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E4E4E4" }}>
          <TextInput value={text} onChangeText={setText} placeholder={tr(L, "typeMsg")} placeholderTextColor="#999" multiline maxLength={1000} style={[s.input, { flex: 1, height: undefined, minHeight: 46, maxHeight: 110, textAlign: rtl ? "right" : "left" }]} />
          <Pressable onPress={send} disabled={busy} style={[s.btn, { width: 52, paddingHorizontal: 0, opacity: busy ? 0.6 : 1 }]}>
            <Ionicons name="send" size={20} color="#fff" style={rtl ? { transform: [{ scaleX: -1 }] } : undefined} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}
