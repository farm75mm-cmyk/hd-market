import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/lib/api";
import { TONES, channelFor, getTone, playChosenTone } from "@/lib/tones";

// In the foreground we show our own in-app banner instead of the system one.
Notifications.setNotificationHandler({
  handleNotification: async () => {
    void playChosenTone();
    return {
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    };
  },
});

let registeredFor = "";
let pushToken = "";

/** Tell the server which tone this device should use for remote notifications. */
export async function syncPushTone(): Promise<void> {
  if (Platform.OS === "web" || !pushToken) return;
  try {
    await api("push_register", { push_token: pushToken, tone: await getTone() }, true);
  } catch { /* ignore */ }
}

/** Ask for permission, get the Expo push token and send it to the server. Safe to call repeatedly. */
export async function registerPush(authToken: string): Promise<void> {
  if (Platform.OS === "web" || !authToken || registeredFor === authToken) return;
  try {
    if (Platform.OS === "android") {
      const base = {
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      };
      await Notifications.setNotificationChannelAsync("support", { name: "الدعم", ...base });
      for (const t of TONES) {
        await Notifications.setNotificationChannelAsync(channelFor(t.key), {
          name: `الدعم · ${t.names.ar}`,
          ...base,
          sound: t.file ?? null,
          ...(t.file ? {} : { vibrationPattern: [0] }),
        });
      }
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    pushToken = t.data;
    await api("push_register", { push_token: t.data, tone: await getTone() }, true);
    registeredFor = authToken;
  } catch {
    /* push is optional: the in-app banner still works through polling */
  }
}
