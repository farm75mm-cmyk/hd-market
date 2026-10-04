import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { Page, s } from "@/components/app-shell";
import { api, type Notif } from "@/lib/api";
import { tr, useLocale } from "@/lib/i18n-app";
import { stamp } from "@/lib/money";

export default function NotificationsScreen() {
  const params = useLocalSearchParams<{ locale?: string }>();
  const L = useLocale(Array.isArray(params.locale) ? params.locale[0] : params.locale);
  const rtl = L === "ar";
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api("notifications", {}, true);
      setItems(r.items ?? []);
      setUnread(r.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const open = async (n: Notif) => {
    if (!n.is_read) {
      setItems((a) => a.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
      setUnread((u) => Math.max(0, u - 1));
      api("notif_read", { id: n.id }, true).catch(() => undefined);
    }
    if (n.ref?.startsWith("DEP-")) router.push({ pathname: "/transaction", params: { locale: L, txn_id: n.ref } });
  };
  const markAll = async () => {
    setItems((a) => a.map((x) => ({ ...x, is_read: 1 })));
    setUnread(0);
    api("notif_read", { all: true }, true).catch(() => undefined);
  };

  return (
    <Page
      title={tr(L, "notifications")}
      locale={L}
      right={unread > 0 ? <Pressable onPress={markAll}><Text style={{ color: "#0A66C2", fontWeight: "700", fontSize: 12 }}>{tr(L, "markAll")}</Text></Pressable> : undefined}
    >
      <FlatList
        data={items}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: 14 }}
        ListEmptyComponent={<Text style={[s.muted, { textAlign: "center", marginTop: 40 }]}>{tr(L, "noNotifs")}</Text>}
        renderItem={({ item: n }) => {
          const t = stamp(n.created_at);
          const title = L === "ar" ? n.title : n.title_en || n.title;
          const body = L === "ar" ? n.body : n.body_en || n.body;
          const al = { textAlign: rtl ? ("right" as const) : ("left" as const), writingDirection: rtl ? ("rtl" as const) : ("ltr" as const) };
          return (
            <Pressable onPress={() => open(n)} style={[s.card, { borderColor: n.is_read ? "#E4E4E4" : "#E8A900", borderWidth: n.is_read ? 1 : 2, backgroundColor: n.is_read ? "#fff" : "#FFFBEA" }]}>
              <View style={{ flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[{ fontWeight: "800", fontSize: 15, flex: 1 }, al]}>{title}</Text>
                <Text style={[s.chip, { backgroundColor: n.is_read ? "#EEE" : "#FFE08A" }]}>{n.is_read ? tr(L, "read") : tr(L, "unread")}</Text>
              </View>
              <Text style={[{ color: "#333", marginTop: 6, lineHeight: 20 }, al]}>{body}</Text>
              <Text style={[s.muted, al, { marginTop: 6 }]}>{t.date} · {t.time}</Text>
            </Pressable>
          );
        }}
      />
    </Page>
  );
}
