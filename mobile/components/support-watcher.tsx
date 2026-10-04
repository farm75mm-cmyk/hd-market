import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, getToken } from "@/lib/api";
import { tr, useLocale } from "@/lib/i18n-app";
import { registerPush } from "@/lib/push";
import { playChosenTone } from "@/lib/tones";

const LOGO = require("@/assets/images/hd-market-logo.png");

/** Polls for new support replies, shows an in-app banner, registers push, and opens the chat when a notification is tapped. */
export function SupportWatcher() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const L = useLocale(undefined);
  const [note, setNote] = useState<{ title: string; body: string; screen: "support" | "notifications" } | null>(null);
  const shown = useRef(0);
  const shownN = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openScreen = useCallback((screen: "support" | "notifications") => {
    setNote(null);
    router.push({ pathname: screen === "support" ? "/support" : "/notifications", params: { locale: L } });
  }, [router, L]);

  const poll = useCallback(async () => {
    const t = await getToken();
    if (!t) return;
    void registerPush(t);
    try {
      const r = await api<{ unread: number; last_id: number; body: string }>("support_poll", {}, true);
      if (r.unread > 0 && r.last_id > shown.current && path !== "/support") {
        shown.current = r.last_id;
        setNote({ title: `HD Market · ${tr(L, "newReply")}`, body: r.body, screen: "support" });
        void playChosenTone();
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setNote(null), 8000);
      }
    } catch {
      /* ignore */
    }
    try {
      const n = await api<{ unread: number; last_id: number; title: string; body: string; title_en: string; body_en: string }>("notif_poll", {}, true);
      if (n.unread > 0 && n.last_id > shownN.current && path !== "/notifications") {
        shownN.current = n.last_id;
        setNote({ title: `HD Market · ${L === "ar" ? n.title : n.title_en || n.title}`, body: L === "ar" ? n.body : n.body_en || n.body, screen: "notifications" });
        void playChosenTone();
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setNote(null), 8000);
      }
    } catch {
      /* ignore */
    }
  }, [path, L]);

  useEffect(() => {
    void poll();
    const id = setInterval(poll, 8000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && void poll());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [poll]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const target = (r: Notifications.NotificationResponse) => ((r.notification.request.content.data as any)?.screen === "notifications" ? "notifications" : "support");
    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && openScreen(target(r)))
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openScreen(target(r)));
    return () => sub.remove();
  }, [openScreen]);

  if (!note) return null;
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable onPress={() => openScreen(note.screen)} style={styles.card}>
        <Image source={LOGO} style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{note.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{note.body}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 9999, elevation: 20 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#111", borderRadius: 18, padding: 12, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10 },
  logo: { width: 44, height: 44, borderRadius: 10 },
  title: { color: "#fff", fontWeight: "800", fontSize: 14 },
  body: { color: "#ddd", fontSize: 13, marginTop: 2 },
});
