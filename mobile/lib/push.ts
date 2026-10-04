import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/lib/api";

// In the foreground we show our own in-app banner instead of the system one.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registeredFor = "";

/** Ask for permission, get the Expo push token and send it to the server. Safe to call repeatedly. */
export async function registerPush(authToken: string): Promise<void> {
  if (Platform.OS === "web" || !authToken || registeredFor === authToken) return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("support", {
        name: "الدعم",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api("push_register", { push_token: t.data }, true);
    registeredFor = authToken;
  } catch {
    /* push is optional: the in-app banner still works through polling */
  }
}
