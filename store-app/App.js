// HD Market shell: a thin native wrapper around the live web store.
// All screens, prices and logic come from the server, so changes appear instantly with no APK update.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

const WEB = "https://hd-market-web-production.up.railway.app";
const API = "https://hd-market-api-production.up.railway.app/api";
const TONES = ["soft_bell", "bell", "marimba", "harp", "bubble", "digital", "loud", "calm", "ding", "silent"];
const ROUTES = { support: "/support", orders: "/orders", wallet: "/wallet", deposits: "/wallet", home: "/home", notifs: "/notifs", update: "/update", ai: "/ai" };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function ensureChannels() {
  if (Platform.OS !== "android") return;
  const base = { importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC };
  await Notifications.setNotificationChannelAsync("support", { name: "HD Market", ...base });
  for (const t of TONES) {
    await Notifications.setNotificationChannelAsync(`hd_support_${t}`, { name: `HD Market · ${t}`, ...base, sound: t === "silent" ? null : `hd_${t}.wav`, ...(t === "silent" ? { vibrationPattern: [0] } : {}) });
  }
}

async function registerPush(token, tone) {
  try {
    await ensureChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await fetch(`${API}/push_register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, push_token: t.data, tone: TONES.includes(tone) ? tone : "soft_bell" }) });
  } catch {}
}

export default function App() {
  const web = useRef(null);
  const [canBack, setCanBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canBack && web.current) { web.current.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canBack]);

  useEffect(() => {
    const open = (resp) => {
      const screen = resp?.notification?.request?.content?.data?.screen;
      const r = ROUTES[screen] || "/notifs";
      web.current?.injectJavaScript(`location.hash=${JSON.stringify("#" + r)};true;`);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync().then((r) => r && setTimeout(() => open(r), 1500)).catch(() => {});
    return () => sub.remove();
  }, []);

  const onMessage = useCallback((e) => {
    let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === "login" && m.token) registerPush(m.token, m.tone);
    else if (m.type === "tone" && m.token) registerPush(m.token, m.tone);
  }, []);

  const retry = () => { setFailed(false); setLoading(true); setKey((k) => k + 1); };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />
      {failed ? (
        <View style={s.center}>
          <Text style={s.title}>غير متصل بالإنترنت · Offline</Text>
          <Text style={s.sub}>تحقق من الاتصال ثم حاول مرة أخرى.</Text>
          <Pressable style={s.btn} onPress={retry}><Text style={s.btnText}>إعادة المحاولة · Retry</Text></Pressable>
        </View>
      ) : (
        <WebView
          key={key}
          ref={web}
          source={{ uri: WEB }}
          style={s.web}
          injectedJavaScriptBeforeContentLoaded="window.__HD_SHELL=true;true;"
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          allowFileAccess
          mediaPlaybackRequiresUserAction={false}
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          cacheMode="LOAD_DEFAULT"
          onMessage={onMessage}
          onNavigationStateChange={(st) => setCanBack(st.canGoBack)}
          onShouldStartLoadWithRequest={(r) => {
            if (r.url.startsWith(WEB) || r.url.startsWith("about:") || r.url.startsWith("blob:") || r.url.startsWith("data:")) return true;
            Linking.openURL(r.url).catch(() => {});
            return false;
          }}
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onHttpError={(ev) => ev.nativeEvent.statusCode >= 500 && setFailed(true)}
        />
      )}
      {loading && !failed ? <View style={s.loader} pointerEvents="none"><ActivityIndicator size="large" color="#e8a900" /></View> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  web: { flex: 1, backgroundColor: "#f4f4f2" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f4f2", padding: 24 },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginBottom: 8, textAlign: "center" },
  sub: { fontSize: 15, color: "#555", marginBottom: 20, textAlign: "center" },
  btn: { backgroundColor: "#e8a900", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { fontWeight: "800", color: "#111", fontSize: 16 },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
