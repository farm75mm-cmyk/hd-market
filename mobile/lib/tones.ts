import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

export type ToneKey =
  | "soft_bell" | "bell" | "marimba" | "harp" | "bubble"
  | "digital" | "loud" | "calm" | "ding" | "silent";

export const DEFAULT_TONE: ToneKey = "soft_bell";
const KEY = "hd-market-notif-tone-v2";

type Def = { key: ToneKey; emoji: string; names: Record<"ar" | "en" | "vi" | "zh", string>; file?: string; src?: number };

export const TONES: Def[] = [
  { key: "soft_bell", emoji: "🔔", names: { ar: "جرس ناعم", en: "Soft bell", vi: "Chuông nhẹ", zh: "轻柔铃声" }, file: "hd_soft_bell.wav", src: require("@/assets/sounds/hd_soft_bell.wav") },
  { key: "bell", emoji: "🔔", names: { ar: "جرس", en: "Bell", vi: "Chuông", zh: "铃声" }, file: "hd_bell.wav", src: require("@/assets/sounds/hd_bell.wav") },
  { key: "marimba", emoji: "🎵", names: { ar: "ماريمبا", en: "Marimba", vi: "Marimba", zh: "马林巴" }, file: "hd_marimba.wav", src: require("@/assets/sounds/hd_marimba.wav") },
  { key: "harp", emoji: "🎵", names: { ar: "هارب", en: "Harp", vi: "Đàn hạc", zh: "竖琴" }, file: "hd_harp.wav", src: require("@/assets/sounds/hd_harp.wav") },
  { key: "bubble", emoji: "🫧", names: { ar: "فقاعة", en: "Bubble", vi: "Bong bóng", zh: "气泡" }, file: "hd_bubble.wav", src: require("@/assets/sounds/hd_bubble.wav") },
  { key: "digital", emoji: "🔢", names: { ar: "رقمي", en: "Digital", vi: "Kỹ thuật số", zh: "数字" }, file: "hd_digital.wav", src: require("@/assets/sounds/hd_digital.wav") },
  { key: "loud", emoji: "🔊", names: { ar: "قوي", en: "Loud", vi: "Lớn", zh: "响亮" }, file: "hd_loud.wav", src: require("@/assets/sounds/hd_loud.wav") },
  { key: "calm", emoji: "🌙", names: { ar: "هادئ", en: "Calm", vi: "Êm dịu", zh: "平静" }, file: "hd_calm.wav", src: require("@/assets/sounds/hd_calm.wav") },
  { key: "ding", emoji: "✨", names: { ar: "دينغ", en: "Ding", vi: "Ding", zh: "叮" }, file: "hd_ding.wav", src: require("@/assets/sounds/hd_ding.wav") },
  { key: "silent", emoji: "🔕", names: { ar: "صامت", en: "Silent", vi: "Im lặng", zh: "静音" } },
];

export const toneDef = (k: string) => TONES.find((t) => t.key === k) ?? TONES[0];
export const toneLabel = (k: string, locale: string) => {
  const d = toneDef(k);
  return d.names[(locale in d.names ? locale : "en") as "ar" | "en" | "vi" | "zh"];
};
export const channelFor = (k: ToneKey) => `hd_support_${k}`;

let cached: ToneKey | null = null;
export async function getTone(): Promise<ToneKey> {
  if (cached) return cached;
  try {
    const v = await AsyncStorage.getItem(KEY);
    cached = TONES.some((t) => t.key === v) ? (v as ToneKey) : DEFAULT_TONE;
  } catch {
    cached = DEFAULT_TONE;
  }
  return cached;
}
export async function saveTone(k: ToneKey) {
  cached = k;
  try { await AsyncStorage.setItem(KEY, k); } catch { /* ignore */ }
}

let player: AudioPlayer | null = null;
let lastPlay = 0;

/** Plays a short preview of a tone. Silent plays nothing. */
export async function previewTone(k: ToneKey) {
  const d = toneDef(k);
  if (!d.src || Platform.OS === "web") return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    player?.remove();
    player = createAudioPlayer(d.src);
    player.play();
  } catch { /* ignore */ }
}

/** Plays the user's chosen tone for an in-app alert (de-duplicated so a push + poll don't double up). */
export async function playChosenTone() {
  const nowMs = Date.now();
  if (nowMs - lastPlay < 4000) return;
  lastPlay = nowMs;
  await previewTone(await getTone());
}
