import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { clearSession, getSession, renameAccount, syncAvatar } from "@/lib/auth-server";
import { getUsernameChangeDaysRemaining } from "@/lib/profile-utils";
import {
  formatStoreClock,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/store-utils";

type Locale = SupportedLocale;
type TabId = "account" | "support" | "chat" | "wallet" | "store";
type ToneId = "classic" | "bell" | "digital";

type Profile = {
  name: string;
  email: string;
  avatarUri: string | null;
  lastNameChangeAt: number | null;
};

type AccountSettings = {
  notificationsEnabled: boolean;
  tone: ToneId;
};

type AccountCopy = {
  account: string;
  support: string;
  chat: string;
  wallet: string;
  store: string;
  memberSincePrefix: string;
  username: string;
  email: string;
  monthlyNote: string;
  save: string;
  saved: string;
  nameRequired: string;
  nameTaken: string;
  photoTitle: string;
  photoError: string;
  photoDenied: string;
  noNotifications: string;
  comingSoon: string;
  settings: string;
  language: string;
  notifications: string;
  notificationTone: string;
  alerts: string;
  purchases: string;
  orders: string;
  checkUpdate: string;
  version: string;
  latestVersion: string;
  logout: string;
  chooseLanguage: string;
  close: string;
  languageName: string;
  tones: Record<ToneId, string>;
  changeBlocked: (days: number) => string;
};

const DATE_LOCALES: Record<Locale, string> = { ar: "ar-u-nu-latn", en: "en-US", vi: "vi-VN", zh: "zh-CN" };

function formatMemberDate(timestamp: number, locale: Locale) {
  try {
    return new Date(timestamp).toLocaleDateString(DATE_LOCALES[locale], {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return new Date(timestamp).toDateString();
  }
}

const PROFILE_STORAGE_KEY = "hd-market-profile-v1";
/** Each account keeps its own profile (photo, last name change) so users never see each other's data. */
const profileKey = (email: string) => `${PROFILE_STORAGE_KEY}:${email.trim().toLowerCase()}`;
const SETTINGS_STORAGE_KEY = "hd-market-account-settings-v1";
const LOCALE_STORAGE_KEY = "hd-market-locale";
const DEFAULT_PROFILE: Profile = {
  name: "Mohammed",
  email: "lord.310mm@gmail.com",
  avatarUri: null,
  lastNameChangeAt: null,
};
const DEFAULT_SETTINGS: AccountSettings = {
  notificationsEnabled: true,
  tone: "classic",
};

const COPY: Record<Locale, AccountCopy> = {
  ar: {
    account: "حسابي",
    support: "الدعم",
    chat: "الدردشة",
    wallet: "المحفظة",
    store: "المتجر",
    memberSincePrefix: "عضو منذ:",
    username: "اسم المستخدم",
    email: "البريد الإلكتروني",
    monthlyNote: "يمكن تغيير اسم المستخدم مرة واحدة كل 15 يومًا",
    save: "حفظ",
    saved: "تم حفظ بيانات الحساب بنجاح.",
    nameRequired: "يرجى إدخال اسم المستخدم.",
    nameTaken: "اسم المستخدم مستخدم مسبقًا.",
    photoTitle: "إضافة صورة الحساب",
    photoError: "تعذر اختيار الصورة. يرجى المحاولة مرة أخرى.",
    photoDenied: "لا يوجد إذن للوصول إلى الصور. فعّله من إعدادات الهاتف ثم أعد المحاولة.",
    noNotifications: "لا توجد إشعارات جديدة.",
    comingSoon: "سيتم إضافة هذه الصفحة قريبًا.",
    settings: "الإعدادات",
    language: "اللغة",
    notifications: "الإشعارات",
    notificationTone: "نغمة الإشعار",
    alerts: "التنبيهات",
    purchases: "مشترياتي (المزارع)",
    orders: "طلبات المنتجات والأدوات",
    checkUpdate: "البحث عن تحديث",
    version: "إصدار التطبيق 3",
    latestVersion: "أنت تستخدم أحدث إصدار من التطبيق.",
    logout: "تسجيل الخروج",
    chooseLanguage: "اختر لغة التطبيق",
    close: "إغلاق",
    languageName: "العربية",
    tones: { classic: "كلاسيكي", bell: "جرس", digital: "رقمي" },
    changeBlocked: (days) => `يمكنك تغيير اسم المستخدم مجددًا بعد ${days} يومًا.`,
  },
  en: {
    account: "Account",
    support: "Support",
    chat: "Chat",
    wallet: "Wallet",
    store: "Store",
    memberSincePrefix: "Member since:",
    username: "Username",
    email: "Email address",
    monthlyNote: "The username can be changed once every 15 days",
    save: "Save",
    saved: "Account details saved successfully.",
    nameRequired: "Please enter a username.",
    nameTaken: "This username is already taken.",
    photoTitle: "Add profile photo",
    photoError: "The photo could not be selected. Please try again.",
    photoDenied: "Photo access is turned off. Enable it in your phone settings and try again.",
    noNotifications: "There are no new notifications.",
    comingSoon: "This page will be added soon.",
    settings: "Settings",
    language: "Language",
    notifications: "Notifications",
    notificationTone: "Notification tone",
    alerts: "Alerts",
    purchases: "My purchases (farms)",
    orders: "Product and tool orders",
    checkUpdate: "Check for update",
    version: "App version 3",
    latestVersion: "You are using the latest app version.",
    logout: "Sign out",
    chooseLanguage: "Choose app language",
    close: "Close",
    languageName: "English",
    tones: { classic: "Classic", bell: "Bell", digital: "Digital" },
    changeBlocked: (days) => `You can change the username again in ${days} day(s).`,
  },
  vi: {
    account: "Tài khoản",
    support: "Hỗ trợ",
    chat: "Trò chuyện",
    wallet: "Ví",
    store: "Cửa hàng",
    memberSincePrefix: "Thành viên từ:",
    username: "Tên người dùng",
    email: "Địa chỉ email",
    monthlyNote: "Tên người dùng chỉ có thể đổi 15 ngày một lần",
    save: "Lưu",
    saved: "Đã lưu thông tin tài khoản.",
    nameRequired: "Vui lòng nhập tên người dùng.",
    nameTaken: "Tên người dùng đã được sử dụng.",
    photoTitle: "Thêm ảnh hồ sơ",
    photoError: "Không thể chọn ảnh. Vui lòng thử lại.",
    photoDenied: "Quyền truy cập ảnh đang tắt. Hãy bật trong cài đặt điện thoại rồi thử lại.",
    noNotifications: "Không có thông báo mới.",
    comingSoon: "Trang này sẽ sớm được bổ sung.",
    settings: "Cài đặt",
    language: "Ngôn ngữ",
    notifications: "Thông báo",
    notificationTone: "Âm báo",
    alerts: "Cảnh báo",
    purchases: "Đơn mua (nông trại)",
    orders: "Đơn sản phẩm và công cụ",
    checkUpdate: "Kiểm tra cập nhật",
    version: "Phiên bản ứng dụng 3",
    latestVersion: "Bạn đang dùng phiên bản mới nhất.",
    logout: "Đăng xuất",
    chooseLanguage: "Chọn ngôn ngữ ứng dụng",
    close: "Đóng",
    languageName: "Tiếng Việt",
    tones: { classic: "Cổ điển", bell: "Chuông", digital: "Kỹ thuật số" },
    changeBlocked: (days) => `Bạn có thể đổi tên người dùng sau ${days} ngày.`,
  },
  zh: {
    account: "我的",
    support: "客服",
    chat: "聊天",
    wallet: "钱包",
    store: "商店",
    memberSincePrefix: "加入时间：",
    username: "用户名",
    email: "电子邮箱",
    monthlyNote: "用户名每 15 天只能修改一次",
    save: "保存",
    saved: "账户信息已保存。",
    nameRequired: "请输入用户名。",
    nameTaken: "该用户名已被使用。",
    photoTitle: "添加头像",
    photoError: "无法选择图片，请重试。",
    photoDenied: "相册权限已关闭，请在手机设置中开启后重试。",
    noNotifications: "暂无新通知。",
    comingSoon: "该页面即将上线。",
    settings: "设置",
    language: "语言",
    notifications: "通知",
    notificationTone: "通知铃声",
    alerts: "提醒",
    purchases: "我的农场购买",
    orders: "产品和工具订单",
    checkUpdate: "检查更新",
    version: "应用版本 3",
    latestVersion: "您正在使用最新版本。",
    logout: "退出登录",
    chooseLanguage: "选择应用语言",
    close: "关闭",
    languageName: "中文",
    tones: { classic: "经典", bell: "铃声", digital: "数字" },
    changeBlocked: (days) => `您可以在 ${days} 天后再次更改用户名。`,
  },
};

const LOGO = require("@/assets/images/hd-market-logo.png");
const LANGUAGE_OPTIONS: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
];
const TAB_ORDER: { id: TabId; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "account", icon: "person-outline" },
  { id: "support", icon: "headset-outline" },
  { id: "chat", icon: "chatbubble-outline" },
  { id: "wallet", icon: "wallet-outline" },
  { id: "store", icon: "storefront-outline" },
];

function SettingsItem({
  label,
  icon,
  rtl,
  value,
  accessory,
  onPress,
  last = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  rtl: boolean;
  value?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <>
      <View style={styles.settingsAccessory}>
        {accessory ?? (
          <View style={styles.settingValueRow}>
            {rtl ? <Ionicons name="chevron-back" size={24} color="#9B9B9B" /> : null}
            {value ? <Text style={styles.settingValueText}>{value}</Text> : null}
            {!rtl ? <Ionicons name="chevron-forward" size={24} color="#9B9B9B" /> : null}
          </View>
        )}
      </View>
      <View style={[styles.settingsMain, rtl ? styles.settingsMainRtl : styles.settingsMainLtr]}>
        <Text style={[styles.settingsLabel, rtl ? styles.textRtl : styles.textLtr]}>{label}</Text>
        <View style={styles.settingsIconBox}>
          <Ionicons name={icon} size={28} color="#050505" />
        </View>
      </View>
    </>
  );

  const rowStyle = [
    styles.settingsRow,
    rtl ? styles.settingsRowRtl : styles.settingsRowLtr,
    last ? styles.settingsRowLast : null,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [rowStyle, pressed && styles.pressedSoft]}>
        {content}
      </Pressable>
    );
  }

  return <View style={rowStyle}>{content}</View>;
}

export default function AccountDetailsScreen() {
  const params = useLocalSearchParams<{ locale?: string | string[] }>();
  const localeParam = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const locale: Locale = isSupportedLocale(localeParam) ? localeParam : "ar";
  const copy = COPY[locale];
  const rtl = locale === "ar";

  const [now, setNow] = useState(() => new Date());
  const [savedName, setSavedName] = useState(DEFAULT_PROFILE.name);
  const [name, setName] = useState(DEFAULT_PROFILE.name);
  const [email, setEmail] = useState(DEFAULT_PROFILE.email);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<number | null>(null);
  const [lastNameChangeAt, setLastNameChangeAt] = useState<number | null>(null);
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    DEFAULT_SETTINGS.notificationsEnabled,
  );
  const [tone, setTone] = useState<ToneId>(DEFAULT_SETTINGS.tone);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // The profile belongs to the signed-in account: name/email come from the account,
    // avatar and last name change are remembered per account.
    (async () => {
      const account = await getSession(AsyncStorage);
      let stored: string | null = null;
      if (account) {
        stored = await AsyncStorage.getItem(profileKey(account.email)).catch(() => null);
      } else {
        stored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY).catch(() => null);
      }
      let base: Partial<Profile> = {};
      try {
        base = stored ? (JSON.parse(stored) as Partial<Profile>) : {};
      } catch {
        base = {};
      }
      const nextName = account?.username || base.name?.trim() || DEFAULT_PROFILE.name;
      setSavedName(nextName);
      setName(nextName);
      setEmail(account?.email || base.email?.trim() || DEFAULT_PROFILE.email);
      setAvatarUri(account?.avatar || base.avatarUri || null);
      setLastNameChangeAt(base.lastNameChangeAt || null);
      setMemberSince(account?.createdAt ?? null);
    })().catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const settings = JSON.parse(stored) as Partial<AccountSettings>;
        if (typeof settings.notificationsEnabled === "boolean") {
          setNotificationsEnabled(settings.notificationsEnabled);
        }
        if (settings.tone === "classic" || settings.tone === "bell" || settings.tone === "digital") {
          setTone(settings.tone);
        }
      })
      .catch(() => undefined);
  }, []);

  const clock = useMemo(() => formatStoreClock(now), [now]);
  const avatarLetter = (savedName.trim().charAt(0) || "M").toUpperCase();

  const persistProfile = async (profile: Profile) => {
    await AsyncStorage.setItem(profileKey(profile.email), JSON.stringify(profile));
  };

  const persistSettings = async (settings: AccountSettings) => {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  };

  const chooseLanguage = async (nextLocale: Locale) => {
    setLanguageOpen(false);
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    router.replace({ pathname: "/account", params: { locale: nextLocale } });
  };

  const toggleNotifications = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    persistSettings({ notificationsEnabled: enabled, tone }).catch(() => undefined);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  };

  const cycleTone = () => {
    const tones: ToneId[] = ["classic", "bell", "digital"];
    const nextTone = tones[(tones.indexOf(tone) + 1) % tones.length];
    setTone(nextTone);
    persistSettings({ notificationsEnabled, tone: nextTone }).catch(() => undefined);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  };

  const pickProfilePhoto = async () => {
    try {
      // Do not await anything before launching: on the web the picker must start inside the tap itself.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const nextAvatar = asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : asset.uri;
      setAvatarUri(nextAvatar);
      void syncAvatar(nextAvatar);
      await persistProfile({
        name: savedName,
        email,
        avatarUri: nextAvatar,
        lastNameChangeAt,
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert(copy.photoTitle, Platform.OS === "web" ? copy.photoError : copy.photoDenied);
    }
  };

  const saveProfile = async () => {
    const nextName = name.trim();
    if (!nextName) {
      setNameError(copy.nameRequired);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    let nextChangedAt = lastNameChangeAt;
    if (nextName !== savedName) {
      const daysRemaining = getUsernameChangeDaysRemaining(lastNameChangeAt);
      if (daysRemaining > 0) {
        setNameError(copy.changeBlocked(daysRemaining));
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        return;
      }
      nextChangedAt = Date.now();
    }

    setSaving(true);
    try {
      if (nextName !== savedName) {
        const renamed = await renameAccount(AsyncStorage, email, nextName);
        if (!renamed.ok) {
          if (renamed.error === "usernameTaken") setNameError(copy.nameTaken);
          else if (renamed.error === "tooSoon") setNameError(copy.changeBlocked(renamed.days ?? 15));
          else setNameError(renamed.error === "network" ? "تعذّر الاتصال بالخادم / Couldn't reach the server" : copy.nameTaken);
          return;
        }
      }
      await persistProfile({
        name: nextName,
        email,
        avatarUri,
        lastNameChangeAt: nextChangedAt,
      });
      setSavedName(nextName);
      setLastNameChangeAt(nextChangedAt);
      setNameError("");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert(copy.account, copy.saved);
    } finally {
      setSaving(false);
    }
  };

  const openSoon = (title: string) => Alert.alert(title, copy.comingSoon);

  return (
    <ScreenContainer
      edges={["top", "bottom", "left", "right"]}
      containerClassName="bg-background"
    >
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.page}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.topHeader}>
              <View style={styles.headerActions}>
                <View style={styles.profileButton}>
                  <Ionicons name="person-outline" size={28} color="#FFFFFF" />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.noNotifications}
                  onPress={() => Alert.alert(copy.account, copy.noNotifications)}
                  style={({ pressed }) => [styles.notificationButton, pressed && styles.pressedSoft]}
                >
                  <Ionicons name="notifications-outline" size={27} color="#050505" />
                </Pressable>
              </View>

              <View style={styles.clockBlock}>
                <Text style={styles.dateText}>{clock.date}</Text>
                <Text style={styles.timeText}>{clock.time}</Text>
              </View>

              <View style={styles.brandBlock}>
                <Text style={styles.brandName}>HD Market</Text>
                <Image source={LOGO} style={styles.headerLogo} contentFit="contain" />
              </View>
            </View>

            <View style={styles.titleRow}>
              <Text style={[styles.pageTitle, rtl ? styles.textRtl : styles.textLtr]}>
                {copy.account}
              </Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.profileSection}>
              <View style={styles.avatarWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.photoTitle}
                  onPress={pickProfilePhoto}
                  style={({ pressed }) => [styles.avatarCircle, pressed && styles.cameraPressed]}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarLetter}>{avatarLetter}</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.photoTitle}
                  onPress={pickProfilePhoto}
                  style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraPressed]}
                >
                  <Ionicons name="camera-outline" size={22} color="#FFFFFF" />
                </Pressable>
              </View>

              <Text style={styles.profileName}>{savedName}</Text>
              <Text style={styles.profileEmail}>{email}</Text>
              <Text style={[styles.memberSince, rtl ? styles.textRtl : styles.textLtr]}>
                {memberSince ? `${copy.memberSincePrefix} ${formatMemberDate(memberSince, locale)}` : ""}
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={[styles.fieldLabel, rtl ? styles.textRtl : styles.textLtr]}>
                {copy.username}
              </Text>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setNameError("");
                }}
                style={[
                  styles.textInput,
                  rtl ? styles.inputRtl : styles.inputLtr,
                  nameError ? styles.inputError : null,
                ]}
                textAlign={rtl ? "right" : "left"}
                autoCapitalize="words"
                autoCorrect={false}
                selectionColor="#111111"
                returnKeyType="done"
                accessibilityLabel={copy.username}
              />
              <View style={[styles.noteRow, rtl ? styles.rowRtl : styles.rowLtr]}>
                <Ionicons name="person-outline" size={19} color="#8A8A8A" />
                <Text style={[styles.noteText, rtl ? styles.textRtl : styles.textLtr]}>
                  {nameError || copy.monthlyNote}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={saveProfile}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.saveButtonPressed,
                  saving && styles.saveButtonDisabled,
                ]}
              >
                <Text style={styles.saveButtonText}>{copy.save}</Text>
              </Pressable>

              <Text style={[styles.fieldLabel, styles.emailLabel, rtl ? styles.textRtl : styles.textLtr]}>
                {copy.email}
              </Text>
              <TextInput
                value={email}
                editable={false}
                style={[styles.textInput, styles.disabledInput, rtl ? styles.inputRtl : styles.inputLtr]}
                textAlign={rtl ? "right" : "left"}
                accessibilityLabel={copy.email}
              />
            </View>

            <Text style={[styles.settingsHeading, rtl ? styles.textRtl : styles.textLtr]}>
              {copy.settings}
            </Text>

            <View style={styles.settingsGroup}>
              <SettingsItem
                label={copy.language}
                icon="globe-outline"
                rtl={rtl}
                value={copy.languageName}
                onPress={() => setLanguageOpen(true)}
              />
              <SettingsItem
                label={copy.notifications}
                icon="notifications-outline"
                rtl={rtl}
                accessory={
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={toggleNotifications}
                    trackColor={{ false: "#D3D3D3", true: "#000000" }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#D3D3D3"
                    style={styles.switchScale}
                  />
                }
              />
              <SettingsItem
                label={copy.notificationTone}
                icon="musical-notes-outline"
                rtl={rtl}
                value={copy.tones[tone]}
                onPress={cycleTone}
                last
              />
            </View>

            <View style={styles.settingsGroup}>
              <SettingsItem
                label={copy.support}
                icon="headset-outline"
                rtl={rtl}
                onPress={() => openSoon(copy.support)}
              />
              <SettingsItem
                label={copy.alerts}
                icon="notifications-outline"
                rtl={rtl}
                onPress={() => openSoon(copy.alerts)}
              />
              <SettingsItem
                label={copy.purchases}
                icon="home-outline"
                rtl={rtl}
                onPress={() => openSoon(copy.purchases)}
              />
              <SettingsItem
                label={copy.orders}
                icon="list-outline"
                rtl={rtl}
                onPress={() => openSoon(copy.orders)}
                last
              />
            </View>

            <View style={styles.settingsGroup}>
              <SettingsItem
                label={copy.checkUpdate}
                icon="download-outline"
                rtl={rtl}
                value={copy.version}
                onPress={() => Alert.alert(copy.checkUpdate, copy.latestVersion)}
                last
              />
            </View>

            <View style={styles.settingsGroup}>
              <Pressable
                onPress={async () => {
                  await clearSession(AsyncStorage);
                  router.replace({ pathname: "/", params: { mode: "login", locale } });
                }}
                style={({ pressed }) => [
                  styles.settingsRow,
                  rtl ? styles.settingsRowRtl : styles.settingsRowLtr,
                  styles.settingsRowLast,
                  pressed && styles.pressedSoft,
                ]}
              >
                <View style={styles.settingsAccessory} />
                <View style={[styles.settingsMain, rtl ? styles.settingsMainRtl : styles.settingsMainLtr]}>
                  <Text
                    style={[
                      styles.settingsLabel,
                      styles.logoutLabel,
                      rtl ? styles.textRtl : styles.textLtr,
                    ]}
                  >
                    {copy.logout}
                  </Text>
                  <View style={[styles.settingsIconBox, styles.logoutIconBox]}>
                    <Ionicons name="log-out-outline" size={28} color="#C52B50" />
                  </View>
                </View>
              </Pressable>
            </View>
          </ScrollView>

          <View style={styles.bottomNav}>
            {TAB_ORDER.map((tab) => {
              const active = tab.id === "account";
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    if (tab.id === "store") {
                      router.replace({ pathname: "/store", params: { locale } });
                      return;
                    }
                    if (!active) openSoon(copy[tab.id]);
                  }}
                  style={({ pressed }) => [styles.navItem, pressed && styles.pressedSoft]}
                >
                  <View style={active ? styles.activeIndicator : styles.inactiveIndicator} />
                  <Ionicons
                    name={tab.icon}
                    size={27}
                    color={active ? "#050505" : "#858585"}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {copy[tab.id]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={languageOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLanguageOpen(false)}>
          <Pressable style={styles.languageSheet} onPress={() => undefined}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, rtl ? styles.textRtl : styles.textLtr]}>
              {copy.chooseLanguage}
            </Text>
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = option.code === locale;
              return (
                <Pressable
                  key={option.code}
                  onPress={() => chooseLanguage(option.code)}
                  style={({ pressed }) => [
                    styles.languageOption,
                    selected && styles.languageOptionSelected,
                    pressed && styles.pressedSoft,
                  ]}
                >
                  <View style={styles.languageOptionLabels}>
                    <Text style={styles.languageNative}>{option.nativeLabel}</Text>
                    <Text style={styles.languageEnglish}>{option.label}</Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setLanguageOpen(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.saveButtonPressed]}
            >
              <Text style={styles.closeButtonText}>{copy.close}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  page: {
    width: "100%",
    maxWidth: 520,
    flex: 1,
    alignSelf: "center",
    backgroundColor: "#FAFAFA",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  topHeader: {
    height: 74,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderTopWidth: Platform.OS === "web" ? 2 : 0,
    borderTopColor: "#050505",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F0",
  },
  clockBlock: {
    alignItems: "center",
    justifyContent: "center",
  },
  dateText: {
    color: "#050505",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  timeText: {
    color: "#555555",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
  },
  brandName: {
    color: "#050505",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  headerLogo: {
    width: 40,
    height: 40,
  },
  titleRow: {
    minHeight: 86,
    paddingHorizontal: 17,
    alignItems: "flex-end",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  pageTitle: {
    width: "100%",
    color: "#050505",
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    backgroundColor: "#E8E8E8",
  },
  profileSection: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 28,
  },
  avatarWrap: {
    width: 124,
    height: 124,
    marginBottom: 20,
  },
  avatarCircle: {
    width: 124,
    height: 124,
    borderRadius: 62,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101010",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarLetter: {
    color: "#FFFFFF",
    fontSize: 58,
    lineHeight: 70,
    fontWeight: "700",
  },
  cameraButton: {
    position: "absolute",
    left: -1,
    bottom: 2,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  cameraPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.96 }],
  },
  profileName: {
    color: "#050505",
    fontSize: 28,
    lineHeight: 38,
    fontWeight: "800",
    textAlign: "center",
  },
  profileEmail: {
    color: "#858585",
    fontSize: 17,
    lineHeight: 25,
    marginTop: 8,
    textAlign: "center",
  },
  memberSince: {
    color: "#858585",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    marginTop: 11,
  },
  formCard: {
    marginHorizontal: 14,
    paddingHorizontal: 17,
    paddingTop: 20,
    paddingBottom: 24,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 5,
  },
  fieldLabel: {
    color: "#5A5A5A",
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "700",
    marginBottom: 8,
  },
  emailLabel: {
    marginTop: 28,
  },
  textInput: {
    width: "100%",
    height: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#FFFFFF",
    color: "#111111",
    fontSize: 19,
    lineHeight: 26,
  },
  inputRtl: {
    paddingHorizontal: 17,
  },
  inputLtr: {
    paddingHorizontal: 17,
  },
  inputError: {
    borderColor: "#C62828",
  },
  disabledInput: {
    color: "#5E5E5E",
    backgroundColor: "#F7F7F7",
  },
  noteRow: {
    alignItems: "center",
    columnGap: 7,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  rowRtl: {
    flexDirection: "row-reverse",
  },
  rowLtr: {
    flexDirection: "row",
  },
  noteText: {
    flexShrink: 1,
    color: "#858585",
    fontSize: 13,
    lineHeight: 20,
  },
  saveButton: {
    width: "100%",
    height: 58,
    marginTop: 17,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  saveButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 27,
    fontWeight: "800",
  },
  textRtl: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  textLtr: {
    textAlign: "left",
    writingDirection: "ltr",
  },
  pressedSoft: {
    opacity: 0.62,
  },
  settingsHeading: {
    color: "#858585",
    fontSize: 21,
    lineHeight: 30,
    fontWeight: "700",
    marginTop: 25,
    marginBottom: 10,
    paddingHorizontal: 18,
  },
  settingsGroup: {
    marginHorizontal: 14,
    marginBottom: 14,
    overflow: "hidden",
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
  },
  settingsRow: {
    minHeight: 75,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ECECEC",
    backgroundColor: "#FFFFFF",
  },
  settingsRowRtl: {
    flexDirection: "row",
  },
  settingsRowLtr: {
    flexDirection: "row-reverse",
  },
  settingsRowLast: {
    borderBottomWidth: 0,
  },
  settingsAccessory: {
    minWidth: 92,
    alignItems: "flex-start",
  },
  settingValueRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 7,
  },
  settingValueText: {
    color: "#9A9A9A",
    fontSize: 16,
    lineHeight: 23,
  },
  settingsMain: {
    flex: 1,
    alignItems: "center",
    columnGap: 12,
  },
  settingsMainRtl: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  settingsMainLtr: {
    flexDirection: "row-reverse",
    justifyContent: "flex-end",
  },
  settingsLabel: {
    flexShrink: 1,
    color: "#050505",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
  },
  settingsIconBox: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F4F4",
  },
  switchScale: {
    transform: [{ scale: 0.9 }],
  },
  logoutLabel: {
    color: "#C52B50",
  },
  logoutIconBox: {
    backgroundColor: "#FFF1F4",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  languageSheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#FFFFFF",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    alignSelf: "center",
    marginBottom: 18,
    borderRadius: 3,
    backgroundColor: "#D5D5D5",
  },
  sheetTitle: {
    color: "#111111",
    fontSize: 23,
    lineHeight: 32,
    fontWeight: "800",
    marginBottom: 14,
    textAlign: "center",
  },
  languageOption: {
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  languageOptionSelected: {
    borderRadius: 15,
    backgroundColor: "#F6F6F6",
  },
  languageOptionLabels: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
  },
  languageNative: {
    color: "#111111",
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
  },
  languageEnglish: {
    color: "#8A8A8A",
    fontSize: 14,
    lineHeight: 22,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#A0A0A0",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: "#000000",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#000000",
  },
  closeButton: {
    width: "100%",
    height: 54,
    marginTop: 20,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  bottomNav: {
    minHeight: 73,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E3E3E3",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 12,
  },
  navItem: {
    flex: 1,
    minHeight: 73,
    alignItems: "center",
    justifyContent: "center",
    rowGap: 3,
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    width: 34,
    height: 4,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: "#000000",
  },
  inactiveIndicator: {
    position: "absolute",
    top: 0,
    width: 34,
    height: 4,
    backgroundColor: "transparent",
  },
  navLabel: {
    color: "#858585",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  navLabelActive: {
    color: "#050505",
    fontWeight: "800",
  },
});
