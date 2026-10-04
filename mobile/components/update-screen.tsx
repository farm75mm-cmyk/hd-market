import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const LOGO = require("@/assets/images/hd-market-logo.png");

type Locale = "ar" | "en" | "vi" | "zh";
const T: Record<Locale, { title: string; dl: string; install: string; again: string; later: string; fail: string; retry: string; v: string }> = {
  ar: { title: "تحديث جديد متاح", dl: "جارٍ تحميل التحديث...", install: "اكتمل التحميل، جارٍ التثبيت...", again: "تثبيت التحديث", later: "لاحقًا", fail: "تعذّر تحميل التحديث. تحقق من الاتصال.", retry: "إعادة المحاولة", v: "الإصدار" },
  en: { title: "New update available", dl: "Downloading update...", install: "Download complete, installing...", again: "Install update", later: "Later", fail: "Couldn't download the update. Check your connection.", retry: "Try again", v: "Version" },
  vi: { title: "Có bản cập nhật mới", dl: "Đang tải bản cập nhật...", install: "Đã tải xong, đang cài đặt...", again: "Cài đặt", later: "Để sau", fail: "Không tải được bản cập nhật.", retry: "Thử lại", v: "Phiên bản" },
  zh: { title: "有新版本可用", dl: "正在下载更新...", install: "下载完成，正在安装...", again: "安装更新", later: "稍后", fail: "无法下载更新，请检查网络。", retry: "重试", v: "版本" },
};

type Phase = "download" | "install" | "error";

export function UpdateScreen({
  locale, version, url, notes, force, onLater,
}: { locale: Locale; version: string; url: string; notes: string; force: boolean; onLater: () => void }) {
  const t = T[locale];
  const rtl = locale === "ar";
  const [pct, setPct] = useState(0);
  const [mb, setMb] = useState("");
  const [phase, setPhase] = useState<Phase>("download");
  const fileRef = useRef<string>("");
  const started = useRef(false);
  const dl = useRef<FileSystem.DownloadResumable | null>(null);
  const w = useSharedValue(0);
  const bar = useAnimatedStyle(() => ({ width: `${w.value}%` }));

  const openInstaller = useCallback(async () => {
    try {
      const uri = await FileSystem.getContentUriAsync(fileRef.current);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: uri,
        flags: 1,
        type: "application/vnd.android.package-archive",
      });
    } catch {
      /* the user can tap the install button again */
    }
  }, []);

  const start = useCallback(async () => {
    setPhase("download");
    setPct(0);
    w.value = 0;
    try {
      const dest = `${FileSystem.cacheDirectory}hd-market-update.apk`;
      fileRef.current = dest;
      await FileSystem.deleteAsync(dest, { idempotent: true });
      dl.current = FileSystem.createDownloadResumable(url, dest, {}, (p) => {
        const total = p.totalBytesExpectedToWrite;
        const got = p.totalBytesWritten;
        setMb(`${(got / 1048576).toFixed(1)}${total > 0 ? ` / ${(total / 1048576).toFixed(1)}` : ""} MB`);
        if (total > 0) {
          const v = Math.min(100, Math.floor((got / total) * 100));
          setPct(v);
          w.value = withTiming(v, { duration: 250 });
        }
      });
      const res = await dl.current.downloadAsync();
      if (!res || res.status !== 200) throw new Error("download");
      setPct(100);
      w.value = withTiming(100, { duration: 250 });
      setPhase("install");
      await openInstaller();
    } catch {
      setPhase("error");
    }
  }, [url, openInstaller, w]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    return () => {
      dl.current?.cancelAsync().catch(() => undefined);
    };
  }, [start]);

  const dir = rtl ? "rtl" : "ltr";
  return (
    <Animated.View style={s.fill} entering={FadeIn.duration(300)}>
      <Image source={LOGO} style={s.logo} resizeMode="contain" />
      <Text style={s.brand}>HD Market</Text>
      <Text style={[s.title, { writingDirection: dir }]}>{t.title}</Text>
      <Text style={s.ver}>{t.v} {version}</Text>
      {notes ? <Text style={[s.notes, { writingDirection: dir }]}>{notes}</Text> : null}

      {phase !== "error" ? (
        <View style={s.barWrap}>
          <View style={s.track}>
            <Animated.View style={[s.fillBar, bar]} />
          </View>
          <Text style={s.pct}>{pct}%</Text>
          <Text style={[s.status, { writingDirection: dir }]}>{phase === "install" ? t.install : t.dl}</Text>
          {mb ? <Text style={s.mb}>{mb}</Text> : null}
        </View>
      ) : (
        <Text style={[s.status, { color: "#B71C1C", marginTop: 24, writingDirection: dir }]}>{t.fail}</Text>
      )}

      {phase === "install" ? (
        <Pressable onPress={openInstaller} style={s.btn}><Text style={s.btnText}>{t.again}</Text></Pressable>
      ) : null}
      {phase === "error" ? (
        <Pressable onPress={start} style={s.btn}><Text style={s.btnText}>{t.retry}</Text></Pressable>
      ) : null}
      {!force ? (
        <Pressable onPress={onLater} style={s.later}><Text style={s.laterText}>{t.later}</Text></Pressable>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", padding: 32 },
  logo: { width: 110, height: 110 },
  brand: { marginTop: 12, fontSize: 26, fontWeight: "800", color: "#0A0A0A", letterSpacing: 1 },
  title: { marginTop: 20, fontSize: 20, fontWeight: "800", color: "#0A0A0A", textAlign: "center" },
  ver: { marginTop: 4, fontSize: 13, color: "#8A8A8A" },
  notes: { marginTop: 12, fontSize: 14, color: "#555", textAlign: "center", lineHeight: 21, maxWidth: 320 },
  barWrap: { marginTop: 28, width: "100%", maxWidth: 320, alignItems: "center" },
  track: { width: "100%", height: 12, borderRadius: 6, backgroundColor: "#EEE", overflow: "hidden" },
  fillBar: { height: "100%", backgroundColor: "#E8A900", borderRadius: 6 },
  pct: { marginTop: 14, fontSize: 40, fontWeight: "800", color: "#0A0A0A" },
  status: { marginTop: 4, fontSize: 14, color: "#6B6B6B", textAlign: "center" },
  mb: { marginTop: 6, fontSize: 12, color: "#9A9A9A" },
  btn: { marginTop: 22, minWidth: 180, height: 50, borderRadius: 14, backgroundColor: "#000", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  btnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  later: { marginTop: 16, padding: 8 },
  laterText: { color: "#777", fontSize: 14, fontWeight: "600" },
});
