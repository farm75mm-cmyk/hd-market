import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { UpdateScreen } from "@/components/update-screen";
import { api, type AppConfig } from "@/lib/api";
import { currentVersion, isNewer } from "@/lib/app-update";

const LOGO = require("@/assets/images/hd-market-logo.png");
const MIN_SPLASH_MS = 2400;
const PING_URL = "https://clients3.google.com/generate_204";

type Locale = "ar" | "en" | "vi" | "zh";
const TEXT: Record<Locale, { title: string; body: string; retry: string; checking: string; dir: "rtl" | "ltr" }> = {
  ar: {
    title: "لا يوجد اتصال بالإنترنت",
    body: "تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.",
    retry: "إعادة المحاولة",
    checking: "جارٍ التحقق من الاتصال...",
    dir: "rtl",
  },
  en: {
    title: "You're offline",
    body: "Check your internet connection and try again.",
    retry: "Try again",
    checking: "Checking connection...",
    dir: "ltr",
  },
  vi: {
    title: "Không có kết nối Internet",
    body: "Hãy kiểm tra kết nối mạng rồi thử lại.",
    retry: "Thử lại",
    checking: "Đang kiểm tra kết nối...",
    dir: "ltr",
  },
  zh: {
    title: "无网络连接",
    body: "请检查网络连接后重试。",
    retry: "重试",
    checking: "正在检查网络...",
    dir: "ltr",
  },
};

async function hasInternet(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${PING_URL}?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.status === 204 || res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function Splash() {
  const scale = useSharedValue(0.3);
  const rotate = useSharedValue(-25);
  const opacity = useSharedValue(0);
  const pulse = useSharedValue(1);
  const ring = useSharedValue(0);
  const dot = [useSharedValue(0.3), useSharedValue(0.3), useSharedValue(0.3)];

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withSpring(1, { damping: 8, stiffness: 90 });
    rotate.value = withSpring(0, { damping: 9, stiffness: 70 });
    pulse.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1.07, { duration: 650, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
    ring.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1);
    dot.forEach((d, i) => {
      d.value = withDelay(
        i * 180,
        withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.3, { duration: 380 })), -1),
      );
    });
    return () => {
      [scale, rotate, opacity, pulse, ring, ...dot].forEach((v) => cancelAnimation(v));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value * pulse.value }, { rotate: `${rotate.value}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.35,
    transform: [{ scale: 1 + ring.value * 0.9 }],
  }));
  const d0 = useAnimatedStyle(() => ({ opacity: dot[0].value, transform: [{ scale: 0.7 + dot[0].value * 0.5 }] }));
  const d1 = useAnimatedStyle(() => ({ opacity: dot[1].value, transform: [{ scale: 0.7 + dot[1].value * 0.5 }] }));
  const d2 = useAnimatedStyle(() => ({ opacity: dot[2].value, transform: [{ scale: 0.7 + dot[2].value * 0.5 }] }));

  return (
    <Animated.View style={styles.fill} exiting={FadeOut.duration(450)}>
      <View style={styles.logoWrap}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Animated.Image source={LOGO} style={[styles.logo, logoStyle]} resizeMode="contain" />
      </View>
      <Animated.Text entering={FadeIn.delay(500).duration(600)} style={styles.brand}>
        HD Market
      </Animated.Text>
      <View style={styles.dots}>
        <Animated.View style={[styles.dot, d0]} />
        <Animated.View style={[styles.dot, d1]} />
        <Animated.View style={[styles.dot, d2]} />
      </View>
    </Animated.View>
  );
}

function Offline({ locale, checking, onRetry }: { locale: Locale; checking: boolean; onRetry: () => void }) {
  const t = TEXT[locale];
  return (
    <Animated.View style={styles.fill} entering={FadeIn.duration(300)}>
      <Image source={LOGO} style={styles.offlineLogo} resizeMode="contain" />
      <Text style={styles.wifi}>📡</Text>
      <Text style={[styles.title, { writingDirection: t.dir }]}>{t.title}</Text>
      <Text style={[styles.body, { writingDirection: t.dir }]}>{checking ? t.checking : t.body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.retry}
        disabled={checking}
        onPress={onRetry}
        style={({ pressed }) => [styles.button, (pressed || checking) && { opacity: 0.7 }]}
      >
        {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t.retry}</Text>}
      </Pressable>
    </Animated.View>
  );
}

const MAINT_TITLE: Record<Locale, { t: string; r: string }> = {
  ar: { t: "تحت الصيانة", r: "إعادة المحاولة" },
  en: { t: "Under maintenance", r: "Try again" },
  vi: { t: "Đang bảo trì", r: "Thử lại" },
  zh: { t: "维护中", r: "重试" },
};

function Maintenance({ locale, message, onRetry }: { locale: Locale; message: string; onRetry: () => void }) {
  const t = MAINT_TITLE[locale];
  return (
    <Animated.View style={styles.fill} entering={FadeIn.duration(300)}>
      <Image source={LOGO} style={styles.offlineLogo} resizeMode="contain" />
      <Text style={styles.wifi}>🛠️</Text>
      <Text style={[styles.title, { writingDirection: TEXT[locale].dir }]}>{t.t}</Text>
      <Text style={[styles.body, { writingDirection: TEXT[locale].dir }]}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
        <Text style={styles.buttonText}>{t.r}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Banner({ text }: { text: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: "#E8A900", paddingTop: Math.max(insets.top, 8), paddingBottom: 8, paddingHorizontal: 14 }}>
      <Text style={{ color: "#111", fontWeight: "800", fontSize: 14, textAlign: "center" }}>{text}</Text>
    </View>
  );
}

export function AppGate({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [locale, setLocale] = useState<Locale>("ar");
  const busy = useRef(false);
  const [skipped, setSkipped] = useState("");

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    const ok = await hasInternet();
    setOnline(ok);
    setChecking(false);
    busy.current = false;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), MIN_SPLASH_MS);
    AsyncStorage.getItem("hd-market-locale")
      .then((l) => {
        if (l === "ar" || l === "en" || l === "vi" || l === "zh") setLocale(l);
      })
      .catch(() => undefined);
    check();
    return () => clearTimeout(t);
  }, [check]);

  // Re-check when the app returns to the foreground, and keep retrying while offline.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, [check]);
  useEffect(() => {
    if (online !== false) return;
    const id = setInterval(check, 4000);
    return () => clearInterval(id);
  }, [online, check]);

  const loadCfg = useCallback(async () => {
    try {
      setCfg(await api("config"));
    } catch {
      /* keep the last known config */
    }
  }, []);
  useEffect(() => {
    if (!online) return;
    void loadCfg();
    const id = setInterval(loadCfg, 20000);
    return () => clearInterval(id);
  }, [online, loadCfg]);

  if (!splashDone || online === null) {
    return (
      <View style={styles.root}>
        <Splash />
      </View>
    );
  }
  if (!online) {
    return (
      <View style={styles.root}>
        <Offline locale={locale} checking={checking} onRetry={check} />
      </View>
    );
  }
  if (cfg?.maintenance.on) {
    return (
      <View style={styles.root}>
        <Maintenance locale={locale} message={cfg.maintenance.message} onRetry={loadCfg} />
      </View>
    );
  }
  const up = cfg?.update;
  if (Platform.OS === "android" && up && up.url && isNewer(up.version, currentVersion()) && (up.force || skipped !== up.version)) {
    return (
      <View style={styles.root}>
        <UpdateScreen locale={locale} version={up.version} url={up.url} notes={up.notes} force={!!up.force} onLater={() => setSkipped(up.version)} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {cfg?.banner.on && cfg.banner.text ? <Banner text={cfg.banner.text} /> : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  fill: { flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", padding: 32 },
  logoWrap: { width: 180, height: 180, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "#E8A900" },
  logo: { width: 140, height: 140 },
  brand: { marginTop: 24, fontSize: 28, fontWeight: "800", color: "#0A0A0A", letterSpacing: 1 },
  dots: { flexDirection: "row", gap: 10, marginTop: 28 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0A0A0A" },
  offlineLogo: { width: 90, height: 90, marginBottom: 12 },
  wifi: { fontSize: 44, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: "#0A0A0A", textAlign: "center" },
  body: { marginTop: 8, fontSize: 15, color: "#6B6B6B", textAlign: "center", lineHeight: 22 },
  button: {
    marginTop: 28,
    minWidth: 180,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
