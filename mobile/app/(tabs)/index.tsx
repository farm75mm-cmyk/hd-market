import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getSession, loginAccount, registerAccount, saveSession } from "@/lib/auth-local";
import { ScreenContainer } from "@/components/screen-container";

type Locale = "ar" | "en" | "vi" | "zh";
type Mode = "register" | "login";
type FormErrors = {
  username?: string;
  email?: string;
  password?: string;
};

type Copy = {
  language: string;
  chooseLanguage: string;
  registerTitle: string;
  loginTitle: string;
  registerSubtitle: string;
  loginSubtitle: string;
  username: string;
  loginIdentifier: string;
  email: string;
  password: string;
  loginPassword: string;
  createAccount: string;
  login: string;
  forgotPassword: string;
  alreadyHaveAccount: string;
  noAccount: string;
  copyright: string;
  errorTitle: string;
  usernameRequired: string;
  loginIdentifierRequired: string;
  emailRequired: string;
  passwordRequired: string;
  emailError: string;
  passwordError: string;
  successTitle: string;
  registerSuccess: string;
  loginSuccess: string;
  resetHint: string;
  noAccount404: string;
  wrongPassword: string;
  lockedOut: string;
  emailTaken: string;
  usernameTaken: string;
  close: string;
};

const COPY: Record<Locale, Copy> = {
  ar: {
    language: "العربية",
    chooseLanguage: "اختر لغة التطبيق",
    registerTitle: "إنشاء حساب",
    loginTitle: "مرحبًا بعودتك",
    registerSubtitle: "انضم إلى HD Market وابدأ بشراء المزارع",
    loginSubtitle: "سجّل الدخول للمتابعة",
    username: "اسم المستخدم",
    loginIdentifier: "اسم المستخدم أو البريد",
    email: "البريد الإلكتروني",
    password: "كلمة المرور (8 أحرف على الأقل)",
    loginPassword: "كلمة المرور",
    createAccount: "إنشاء حساب",
    login: "تسجيل الدخول",
    forgotPassword: "نسيت كلمة المرور؟",
    alreadyHaveAccount: "لديك حساب؟",
    noAccount: "ليس لديك حساب؟",
    copyright: "© HD Market 2020 · جميع الحقوق محفوظة",
    errorTitle: "تنبيه",
    usernameRequired: "يرجى إدخال اسم المستخدم.",
    loginIdentifierRequired: "يرجى إدخال اسم المستخدم أو البريد الإلكتروني.",
    emailRequired: "يرجى إدخال البريد الإلكتروني.",
    passwordRequired: "يرجى إدخال كلمة المرور.",
    emailError: "يرجى إدخال بريد إلكتروني صحيح.",
    passwordError: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
    successTitle: "تم بنجاح",
    registerSuccess: "تم إنشاء الحساب بنجاح.",
    loginSuccess: "تم تسجيل الدخول بنجاح.",
    resetHint: "سوف نرسل رابط استعادة كلمة المرور إلى بريدك الإلكتروني.",
    noAccount404: "لا يوجد حساب بهذا الاسم أو البريد. أنشئ حسابًا أولاً.",
    wrongPassword: "كلمة المرور غير صحيحة.",
    lockedOut: "محاولات كثيرة خاطئة. حاول مجددًا بعد {m} دقيقة.",
    emailTaken: "هذا البريد الإلكتروني مسجّل مسبقًا.",
    usernameTaken: "اسم المستخدم مستخدم مسبقًا.",
    close: "إغلاق",
  },
  en: {
    language: "English",
    chooseLanguage: "Choose app language",
    registerTitle: "Create account",
    loginTitle: "Welcome back",
    registerSubtitle: "Join HD Market and start shopping for farms",
    loginSubtitle: "Sign in to continue",
    username: "Username",
    loginIdentifier: "Username or email",
    email: "Email address",
    password: "Password (at least 8 characters)",
    loginPassword: "Password",
    createAccount: "Create account",
    login: "Sign in",
    forgotPassword: "Forgot password?",
    alreadyHaveAccount: "Already have an account?",
    noAccount: "Don’t have an account?",
    copyright: "© HD Market 2020 · All rights reserved",
    errorTitle: "Notice",
    usernameRequired: "Please enter your username.",
    loginIdentifierRequired: "Please enter your username or email.",
    emailRequired: "Please enter your email address.",
    passwordRequired: "Please enter your password.",
    emailError: "Please enter a valid email address.",
    passwordError: "Password must contain at least 8 characters.",
    successTitle: "Success",
    registerSuccess: "Your account has been created successfully.",
    loginSuccess: "You have signed in successfully.",
    resetHint: "We will send a password reset link to your email address.",
    noAccount404: "No account found with this username or email. Please create an account first.",
    wrongPassword: "Incorrect password.",
    lockedOut: "Too many failed attempts. Try again in {m} minute(s).",
    emailTaken: "This email is already registered.",
    usernameTaken: "This username is already taken.",
    close: "Close",
  },
  vi: {
    language: "Tiếng Việt",
    chooseLanguage: "Chọn ngôn ngữ ứng dụng",
    registerTitle: "Tạo tài khoản",
    loginTitle: "Chào mừng trở lại",
    registerSubtitle: "Tham gia HD Market và bắt đầu mua sắm trang trại",
    loginSubtitle: "Đăng nhập để tiếp tục",
    username: "Tên người dùng",
    loginIdentifier: "Tên người dùng hoặc email",
    email: "Địa chỉ email",
    password: "Mật khẩu (ít nhất 8 ký tự)",
    loginPassword: "Mật khẩu",
    createAccount: "Tạo tài khoản",
    login: "Đăng nhập",
    forgotPassword: "Quên mật khẩu?",
    alreadyHaveAccount: "Bạn đã có tài khoản?",
    noAccount: "Bạn chưa có tài khoản?",
    copyright: "© HD Market 2020 · Đã đăng ký bản quyền",
    errorTitle: "Thông báo",
    usernameRequired: "Vui lòng nhập tên người dùng.",
    loginIdentifierRequired: "Vui lòng nhập tên người dùng hoặc email.",
    emailRequired: "Vui lòng nhập địa chỉ email.",
    passwordRequired: "Vui lòng nhập mật khẩu.",
    emailError: "Vui lòng nhập địa chỉ email hợp lệ.",
    passwordError: "Mật khẩu phải có ít nhất 8 ký tự.",
    successTitle: "Thành công",
    registerSuccess: "Tài khoản đã được tạo thành công.",
    loginSuccess: "Bạn đã đăng nhập thành công.",
    resetHint: "Chúng tôi sẽ gửi liên kết đặt lại mật khẩu đến email của bạn.",
    noAccount404: "Không tìm thấy tài khoản với tên người dùng hoặc email này. Vui lòng tạo tài khoản trước.",
    wrongPassword: "Mật khẩu không đúng.",
    lockedOut: "Quá nhiều lần thử sai. Hãy thử lại sau {m} phút.",
    emailTaken: "Email này đã được đăng ký.",
    usernameTaken: "Tên người dùng đã được sử dụng.",
    close: "Đóng",
  },
  zh: {
    language: "中文",
    chooseLanguage: "选择应用语言",
    registerTitle: "创建账户",
    loginTitle: "欢迎回来",
    registerSubtitle: "加入 HD Market，开始选购农场",
    loginSubtitle: "登录以继续",
    username: "用户名",
    loginIdentifier: "用户名或电子邮箱",
    email: "电子邮箱",
    password: "密码（至少 8 个字符）",
    loginPassword: "密码",
    createAccount: "创建账户",
    login: "登录",
    forgotPassword: "忘记密码？",
    alreadyHaveAccount: "已有账户？",
    noAccount: "还没有账户？",
    copyright: "© HD Market 2020 · 版权所有",
    errorTitle: "提示",
    usernameRequired: "请输入用户名。",
    loginIdentifierRequired: "请输入用户名或电子邮箱。",
    emailRequired: "请输入电子邮箱。",
    passwordRequired: "请输入密码。",
    emailError: "请输入有效的电子邮箱。",
    passwordError: "密码至少需要 8 个字符。",
    successTitle: "成功",
    registerSuccess: "账户创建成功。",
    loginSuccess: "登录成功。",
    resetHint: "我们会将密码重置链接发送到您的电子邮箱。",
    noAccount404: "未找到该用户名或邮箱对应的账户，请先创建账户。",
    wrongPassword: "密码错误。",
    lockedOut: "失败次数过多，请 {m} 分钟后再试。",
    emailTaken: "该邮箱已被注册。",
    usernameTaken: "该用户名已被使用。",
    close: "关闭",
  },
};

const LANGUAGE_OPTIONS: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
];

const LOGO = require("@/assets/images/hd-market-logo.png");
const LOCALE_STORAGE_KEY = "hd-market-locale";

function FormField({
  label,
  icon,
  value,
  onChangeText,
  rtl,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
  error,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  rtl: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
  error?: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, rtl ? styles.textRtl : styles.textLtr]}>{label}</Text>
      <View style={[styles.inputShell, error ? styles.inputShellError : null]}>
        <Ionicons
          name={icon}
          size={27}
          color="#858585"
          style={rtl ? styles.fieldIconRtl : styles.fieldIconLtr}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          style={[styles.input, rtl ? styles.inputRtl : styles.inputLtr]}
          textAlign={rtl ? "right" : "left"}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          selectionColor="#111111"
          returnKeyType="done"
          accessibilityLabel={label}
        />
      </View>
      {error ? (
        <View style={[styles.errorRow, rtl ? styles.errorRowRtl : styles.errorRowLtr]}>
          <Ionicons name="alert-circle-outline" size={16} color="#C62828" />
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.errorText, rtl ? styles.textRtl : styles.textLtr]}
          >
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function AccountScreen() {
  const { mode: requestedMode, locale: requestedLocale } = useLocalSearchParams<{
    mode?: string;
    locale?: string;
  }>();
  const [locale, setLocale] = useState<Locale>(
    requestedLocale === "en" || requestedLocale === "vi" || requestedLocale === "zh"
      ? requestedLocale
      : "ar",
  );
  const [languageOpen, setLanguageOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(requestedMode === "register" ? "register" : "login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  const copy = COPY[locale];
  const rtl = locale === "ar";
  const isRegister = mode === "register";
  const screenDirection = rtl ? styles.directionRtl : styles.directionLtr;

  const languageTitle = useMemo(() => COPY[locale].chooseLanguage, [locale]);

  useEffect(() => {
    if (requestedLocale === "ar" || requestedLocale === "en" || requestedLocale === "vi" || requestedLocale === "zh") {
      return;
    }
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((storedLocale) => {
        if (storedLocale === "ar" || storedLocale === "en" || storedLocale === "vi" || storedLocale === "zh") {
          setLocale(storedLocale);
        }
      })
      .catch(() => undefined);
  }, [requestedLocale]);

  // Returning user: if an account is remembered on this device, sign in automatically.
  useEffect(() => {
    if (requestedMode) return; // explicit navigation (e.g. after sign-out) shows the form
    let cancelled = false;
    getSession(AsyncStorage).then(async (account) => {
      if (!account || cancelled) return;
      const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY).catch(() => null);
      const target =
        stored === "ar" || stored === "en" || stored === "vi" || stored === "zh" ? stored : locale;
      router.replace({ pathname: "/store", params: { locale: target } });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseLanguage = async (nextLocale: Locale) => {
    setLocale(nextLocale);
    setErrors({});
    setLanguageOpen(false);
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  };

  const clearError = (field: keyof FormErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const submit = () => {
    const nextErrors: FormErrors = {};
    const identifier = email.trim();

    if (isRegister && !username.trim()) {
      nextErrors.username = copy.usernameRequired;
    }
    if (!identifier) {
      nextErrors.email = isRegister ? copy.emailRequired : copy.loginIdentifierRequired;
    } else if ((isRegister || identifier.includes("@")) && !/^\S+@\S+\.\S+$/.test(identifier)) {
      nextErrors.email = copy.emailError;
    }
    if (!password) {
      nextErrors.password = copy.passwordRequired;
    } else if (isRegister && password.length < 8) {
      nextErrors.password = copy.passwordError;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }
    const fail = (errs: FormErrors) => {
      setErrors(errs);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };
    void (async () => {
      if (isRegister) {
        const result = await registerAccount(AsyncStorage, { username, email: identifier, password });
        if (!result.ok) {
          if (result.error === "usernameTaken") fail({ username: copy.usernameTaken });
          else fail({ email: copy.emailTaken });
          return;
        }
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(copy.successTitle, copy.registerSuccess);
        setMode("login");
        setPassword("");
        return;
      }
      const result = await loginAccount(AsyncStorage, identifier, password);
      if (!result.ok) {
        if (result.error === "noAccount") fail({ email: copy.noAccount404 });
        else if (result.error === "locked") {
          const minutes = Math.max(1, Math.ceil((result.retryAfterSec ?? 300) / 60));
          fail({ password: copy.lockedOut.replace("{m}", String(minutes)) });
        } else fail({ password: copy.wrongPassword });
        return;
      }
      await saveSession(AsyncStorage, result.account.email);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: "/store", params: { locale } });
    })();
  };

  const switchMode = () => {
    setMode(isRegister ? "login" : "register");
    setPassword("");
    setErrors({});
  };

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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.page}>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={languageTitle}
                onPress={() => setLanguageOpen(true)}
                style={({ pressed }) => [styles.languageButton, pressed && styles.pressedSoft]}
              >
                <Ionicons name="chevron-down" size={20} color="#111111" />
                <Text style={styles.languageText}>{copy.language}</Text>
                <Ionicons name="globe-outline" size={25} color="#111111" />
              </Pressable>

              <View style={styles.brandBlock}>
                <Text style={styles.brandName}>HD Market</Text>
                <Image source={LOGO} style={styles.headerLogo} contentFit="contain" />
              </View>
            </View>

            <View style={styles.hero}>
              <View style={styles.heroLogoShadow}>
                <Image source={LOGO} style={styles.heroLogo} contentFit="contain" />
              </View>
              <Text style={[styles.title, screenDirection]}>
                {isRegister ? copy.registerTitle : copy.loginTitle}
              </Text>
              <Text style={[styles.subtitle, screenDirection]}>
                {isRegister ? copy.registerSubtitle : copy.loginSubtitle}
              </Text>
            </View>

            <View style={styles.card}>
              {isRegister ? (
                <FormField
                  label={copy.username}
                  icon="person-outline"
                  value={username}
                  onChangeText={(value) => {
                    setUsername(value);
                    clearError("username");
                  }}
                  rtl={rtl}
                  autoCapitalize="words"
                  error={errors.username}
                />
              ) : null}

              <FormField
                label={isRegister ? copy.email : copy.loginIdentifier}
                icon={isRegister ? "mail-outline" : "person-outline"}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  clearError("email");
                }}
                rtl={rtl}
                keyboardType={isRegister ? "email-address" : "default"}
                error={errors.email}
              />

              <FormField
                label={isRegister ? copy.password : copy.loginPassword}
                icon="lock-closed-outline"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  clearError("password");
                }}
                rtl={rtl}
                secureTextEntry
                error={errors.password}
              />

              <Pressable
                accessibilityRole="button"
                onPress={submit}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
              >
                <View style={[styles.buttonContent, rtl ? styles.rowRtl : styles.rowLtr]}>
                  <Text style={styles.primaryButtonText}>
                    {isRegister ? copy.createAccount : copy.login}
                  </Text>
                  <Ionicons
                    name={isRegister ? "person-add-outline" : "log-in-outline"}
                    size={25}
                    color="#ffffff"
                  />
                </View>
              </Pressable>
            </View>

            {!isRegister ? (
              <Pressable
                onPress={() => Alert.alert(copy.forgotPassword, copy.resetHint)}
                style={({ pressed }) => [styles.forgotPasswordButton, pressed && styles.pressedSoft]}
              >
                <Text style={styles.forgotPasswordText}>{copy.forgotPassword}</Text>
              </Pressable>
            ) : null}

            <View style={[styles.loginPrompt, rtl ? styles.promptRowRtl : styles.promptRowLtr]}>
              <Text style={styles.promptText}>
                {isRegister ? copy.alreadyHaveAccount : copy.noAccount}
              </Text>
              <Pressable onPress={switchMode} style={({ pressed }) => pressed && styles.pressedSoft}>
                <Text style={styles.loginLink}>
                  {isRegister ? copy.login : copy.createAccount}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.footer}>{copy.copyright}</Text>
          </View>
        </ScrollView>
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
            <Text style={[styles.sheetTitle, screenDirection]}>{languageTitle}</Text>
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
              style={({ pressed }) => [styles.closeButton, pressed && styles.primaryPressed]}
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
  scrollContent: {
    flexGrow: 1,
  },
  page: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: "#FAFAFA",
  },
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  languageButton: {
    minWidth: 126,
    height: 50,
    paddingHorizontal: 15,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 9,
  },
  languageText: {
    color: "#111111",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
  },
  brandName: {
    color: "#050505",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerLogo: {
    width: 40,
    height: 40,
  },
  hero: {
    alignItems: "center",
    width: "100%",
    marginBottom: 28,
  },
  heroLogoShadow: {
    width: 104,
    height: 104,
    marginBottom: 26,
    borderRadius: 29,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 12,
  },
  heroLogo: {
    width: 104,
    height: 104,
  },
  title: {
    width: "100%",
    color: "#050505",
    fontSize: 30,
    lineHeight: 40,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    width: "100%",
    color: "#7C7C7C",
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "400",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: 19,
    paddingTop: 19,
    paddingBottom: 19,
    rowGap: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 7,
  },
  fieldGroup: {
    width: "100%",
    rowGap: 6,
  },
  label: {
    color: "#202020",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "700",
    paddingHorizontal: 2,
  },
  textRtl: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  textLtr: {
    textAlign: "left",
    writingDirection: "ltr",
  },
  directionRtl: {
    writingDirection: "rtl",
  },
  directionLtr: {
    writingDirection: "ltr",
  },
  inputShell: {
    width: "100%",
    height: 57,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8F8F8",
    justifyContent: "center",
  },
  inputShellError: {
    borderColor: "#C62828",
  },
  input: {
    width: "100%",
    height: "100%",
    color: "#111111",
    fontSize: 17,
    lineHeight: 24,
  },
  inputRtl: {
    paddingLeft: 18,
    paddingRight: 60,
  },
  inputLtr: {
    paddingLeft: 60,
    paddingRight: 18,
  },
  fieldIconRtl: {
    position: "absolute",
    right: 20,
    zIndex: 1,
  },
  fieldIconLtr: {
    position: "absolute",
    left: 20,
    zIndex: 1,
  },
  errorRow: {
    width: "100%",
    alignItems: "center",
    columnGap: 5,
    paddingHorizontal: 3,
  },
  errorRowRtl: {
    flexDirection: "row-reverse",
    justifyContent: "flex-start",
  },
  errorRowLtr: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  errorText: {
    flexShrink: 1,
    color: "#C62828",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  primaryButton: {
    width: "100%",
    height: 60,
    marginTop: 3,
    borderRadius: 19,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  pressedSoft: {
    opacity: 0.65,
  },
  buttonContent: {
    alignItems: "center",
    justifyContent: "center",
    columnGap: 10,
  },
  rowRtl: {
    flexDirection: "row",
  },
  rowLtr: {
    flexDirection: "row-reverse",
  },
  promptRowRtl: {
    flexDirection: "row-reverse",
  },
  promptRowLtr: {
    flexDirection: "row",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700",
  },
  loginPrompt: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    columnGap: 5,
    marginTop: 23,
  },
  forgotPasswordButton: {
    alignSelf: "center",
    marginTop: 23,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  forgotPasswordText: {
    color: "#111111",
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "800",
    textAlign: "center",
  },
  promptText: {
    color: "#7F7F7F",
    fontSize: 16,
    lineHeight: 25,
  },
  loginLink: {
    color: "#111111",
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  footer: {
    marginTop: "auto",
    paddingTop: 28,
    color: "#8A8A8A",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
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
    backgroundColor: "#F6F6F6",
    borderRadius: 15,
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
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
});
