import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { FOOD_ITEMS, FOOD_PRICE_USDT, type FoodItem } from "@/lib/food-data";
import { FOOD_IMAGES } from "@/lib/food-images";
import {
  filterFoodItems,
  formatUsdt,
  parseReadyList,
  summarizeSelection,
  type FoodQuantities,
} from "@/lib/food-utils";
import { isSupportedLocale, type SupportedLocale } from "@/lib/store-utils";

type Locale = SupportedLocale;
type TabId = "account" | "support" | "chat" | "wallet" | "store";
type Mode = "manual" | "ready";

/** Wallet balance. Stays 0 until the server wallet is connected. */
const WALLET_BALANCE = 0;

type FoodCopy = {
  title: string;
  manual: string;
  ready: string;
  search: string;
  pieces: string;
  confirm: string;
  paste: string;
  apply: string;
  needSelection: string;
  insufficient: string;
  ordered: string;
  notFound: string;
  selectedList: string;
  total: string;
  reset: string;
  close: string;
  noResults: string;
  back: string;
  account: string;
  support: string;
  chat: string;
  wallet: string;
  store: string;
  comingSoon: string;
};

const COPY: Record<Locale, FoodCopy> = {
  ar: {
    title: "Food",
    manual: "اختيار المنتجات يدويًا",
    ready: "إرسال قائمة جاهزة",
    search: "ابحث عن منتج",
    pieces: "قطعة",
    confirm: "تأكيد الطلب",
    paste: "الصق قائمتك هنا، كل منتج في سطر، مثل:\nLamb Doner Wrap x3",
    apply: "تطبيق القائمة",
    needSelection: "اختر منتجًا أولًا.",
    insufficient: "رصيدك غير كافٍ. اشحن المحفظة أولًا.",
    ordered: "تم تأكيد طلبك",
    notFound: "غير موجود: ",
    selectedList: "القائمة المختارة",
    total: "الإجمالي",
    reset: "إعادة تعيين القائمة",
    close: "إغلاق",
    noResults: "لا توجد نتائج.",
    back: "رجوع",
    account: "حسابي",
    support: "الدعم",
    chat: "الدردشة",
    wallet: "المحفظة",
    store: "المتجر",
    comingSoon: "سيتم إضافة هذه الصفحة قريبًا.",
  },
  en: {
    title: "Food",
    manual: "Choose products manually",
    ready: "Send a ready list",
    search: "Search for a product",
    pieces: "items",
    confirm: "Confirm order",
    paste: "Paste your list here, one product per line, e.g.:\nLamb Doner Wrap x3",
    apply: "Apply list",
    needSelection: "Select a product first.",
    insufficient: "Insufficient balance. Top up your wallet first.",
    ordered: "Order confirmed",
    notFound: "Not found: ",
    selectedList: "Selected list",
    total: "Total",
    reset: "Reset list",
    close: "Close",
    noResults: "No results.",
    back: "Back",
    account: "Account",
    support: "Support",
    chat: "Chat",
    wallet: "Wallet",
    store: "Store",
    comingSoon: "This page will be added soon.",
  },
  vi: {
    title: "Food",
    manual: "Chọn sản phẩm thủ công",
    ready: "Gửi danh sách có sẵn",
    search: "Tìm sản phẩm",
    pieces: "món",
    confirm: "Xác nhận đơn hàng",
    paste: "Dán danh sách vào đây, mỗi sản phẩm một dòng, ví dụ:\nLamb Doner Wrap x3",
    apply: "Áp dụng danh sách",
    needSelection: "Hãy chọn sản phẩm trước.",
    insufficient: "Số dư không đủ. Hãy nạp ví trước.",
    ordered: "Đã xác nhận đơn hàng",
    notFound: "Không tìm thấy: ",
    selectedList: "Danh sách đã chọn",
    total: "Tổng",
    reset: "Đặt lại danh sách",
    close: "Đóng",
    noResults: "Không có kết quả.",
    back: "Quay lại",
    account: "Tài khoản",
    support: "Hỗ trợ",
    chat: "Trò chuyện",
    wallet: "Ví",
    store: "Cửa hàng",
    comingSoon: "Trang này sẽ sớm được bổ sung.",
  },
  zh: {
    title: "Food",
    manual: "手动选择商品",
    ready: "发送现成清单",
    search: "搜索商品",
    pieces: "件",
    confirm: "确认订单",
    paste: "在此粘贴清单，每行一个商品，例如：\nLamb Doner Wrap x3",
    apply: "应用清单",
    needSelection: "请先选择商品。",
    insufficient: "余额不足，请先充值钱包。",
    ordered: "订单已确认",
    notFound: "未找到：",
    selectedList: "已选清单",
    total: "合计",
    reset: "重置清单",
    close: "关闭",
    noResults: "没有结果。",
    back: "返回",
    account: "我的",
    support: "客服",
    chat: "聊天",
    wallet: "钱包",
    store: "商店",
    comingSoon: "该页面即将上线。",
  },
};

const TAB_ORDER: { id: TabId; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "account", icon: "person-outline" },
  { id: "support", icon: "headset-outline" },
  { id: "chat", icon: "chatbubble-outline" },
  { id: "wallet", icon: "wallet-outline" },
  { id: "store", icon: "storefront-outline" },
];

type FoodRowProps = {
  item: FoodItem;
  quantity: number;
  rtl: boolean;
  onChange: (id: number, value: number) => void;
};

const FoodRow = memo(function FoodRow({ item, quantity, rtl, onChange }: FoodRowProps) {
  return (
    <View style={[styles.row, rtl && styles.rowReverse]}>
      <View style={styles.imageBox}>
        <Image
          source={FOOD_IMAGES[item.id]}
          style={styles.itemImage}
          contentFit="contain"
          accessibilityLabel={item.name}
        />
      </View>

      <View style={styles.nameBlock}>
        <Text style={[styles.itemName, rtl ? styles.textRtl : styles.textLtr]}>{item.name}</Text>
        <Text style={[styles.itemPrice, styles.textLtr, rtl && styles.alignEnd]}>
          {formatUsdt(FOOD_PRICE_USDT)} USDT
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`- ${item.name}`}
        onPress={() => onChange(item.id, quantity - 1)}
        style={({ pressed }) => [styles.stepButton, styles.minusButton, pressed && styles.pressedSoft]}
      >
        <Ionicons name="remove" size={22} color="#050505" />
      </Pressable>

      <TextInput
        accessibilityLabel={item.name}
        keyboardType="number-pad"
        maxLength={4}
        onChangeText={(text) => onChange(item.id, Number(text.replace(/[^0-9]/g, "")) || 0)}
        selectTextOnFocus
        style={styles.quantityInput}
        value={String(quantity)}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`+ ${item.name}`}
        onPress={() => onChange(item.id, quantity + 1)}
        style={({ pressed }) => [styles.stepButton, styles.plusButton, pressed && styles.pressedSoft]}
      >
        <Ionicons name="add" size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
});

export default function FoodScreen() {
  const params = useLocalSearchParams<{ locale?: string | string[] }>();
  const localeParam = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const locale: Locale = isSupportedLocale(localeParam) ? localeParam : "ar";
  const copy = COPY[locale];
  const rtl = locale === "ar";

  const [mode, setMode] = useState<Mode>("manual");
  const [term, setTerm] = useState("");
  const [pasted, setPasted] = useState("");
  const [quantities, setQuantities] = useState<FoodQuantities>({});
  const [sheetOpen, setSheetOpen] = useState(false);

  const visibleItems = useMemo(() => filterFoodItems(FOOD_ITEMS, term), [term]);
  const summary = useMemo(
    () => summarizeSelection(FOOD_ITEMS, quantities, FOOD_PRICE_USDT),
    [quantities],
  );
  const selectedItems = useMemo(
    () => FOOD_ITEMS.filter((item) => (quantities[item.id] ?? 0) > 0),
    [quantities],
  );

  const setQuantity = useCallback((id: number, value: number) => {
    const next = Math.max(0, Math.min(9999, Math.floor(value) || 0));
    setQuantities((current) => {
      if ((current[id] ?? 0) === next) return current;
      const updated = { ...current };
      if (next > 0) updated[id] = next;
      else delete updated[id];
      return updated;
    });
  }, []);

  const applyReadyList = () => {
    const { quantities: parsed, missing } = parseReadyList(pasted, FOOD_ITEMS);
    setQuantities((current) => {
      const merged = { ...current };
      for (const [id, amount] of Object.entries(parsed)) {
        merged[Number(id)] = Math.min(9999, (merged[Number(id)] ?? 0) + amount);
      }
      return merged;
    });
    setPasted("");
    setMode("manual");
    if (missing.length > 0) Alert.alert(copy.title, `${copy.notFound}${missing.join(", ")}`);
  };

  const confirmOrder = () => {
    if (summary.count === 0) {
      Alert.alert(copy.title, copy.needSelection);
      return;
    }
    if (summary.total > WALLET_BALANCE) {
      Alert.alert(copy.title, copy.insufficient);
      return;
    }
    setQuantities({});
    Alert.alert(copy.title, copy.ordered);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/store", params: { locale } });
  };

  const onTabPress = (id: TabId) => {
    if (id === "store") {
      router.replace({ pathname: "/store", params: { locale } });
      return;
    }
    if (id === "account") {
      router.replace({ pathname: "/account", params: { locale } });
      return;
    }
    Alert.alert(copy[id], copy.comingSoon);
  };

  const rowDirection = rtl ? styles.rowReverse : null;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <StatusBar style="dark" />
      <View style={styles.page}>
        <View style={[styles.titleRow, rowDirection]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.back}
            onPress={goBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name={rtl ? "chevron-forward" : "chevron-back"} size={28} color="#050505" />
          </Pressable>
          <Text style={[styles.pageTitle, rtl ? styles.textRtl : styles.textLtr]}>{copy.title}</Text>
          <View style={[styles.balancePill, rowDirection]}>
            <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
            <Text style={styles.balanceText}>{formatUsdt(WALLET_BALANCE)}</Text>
          </View>
        </View>

        <View style={[styles.modeRow, rowDirection]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === "manual" }}
            onPress={() => setMode("manual")}
            style={[styles.modeButton, mode === "manual" && styles.modeButtonActive, rowDirection]}
          >
            <Ionicons name="list-outline" size={22} color={mode === "manual" ? "#FFFFFF" : "#050505"} />
            <Text style={[styles.modeText, mode === "manual" && styles.modeTextActive]}>{copy.manual}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === "ready" }}
            onPress={() => setMode("ready")}
            style={[styles.modeButton, mode === "ready" && styles.modeButtonActive, rowDirection]}
          >
            <Ionicons name="clipboard-outline" size={21} color={mode === "ready" ? "#FFFFFF" : "#050505"} />
            <Text style={[styles.modeText, mode === "ready" && styles.modeTextActive]}>{copy.ready}</Text>
          </Pressable>
        </View>

        {mode === "manual" ? (
          <>
            <TextInput
              accessibilityLabel={copy.search}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setTerm}
              placeholder={copy.search}
              placeholderTextColor="#8A8A8A"
              returnKeyType="search"
              style={[styles.searchInput, rtl ? styles.textRtl : styles.textLtr]}
              value={term}
            />

            <FlatList
              data={visibleItems}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <FoodRow item={item} quantity={quantities[item.id] ?? 0} rtl={rtl} onChange={setQuantity} />
              )}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews={Platform.OS !== "web"}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyText}>{copy.noResults}</Text>}
              showsVerticalScrollIndicator={false}
            />

            <View style={[styles.summaryBar, rowDirection]}>
              <Text style={[styles.summaryText, rtl ? styles.textRtl : styles.textLtr]} numberOfLines={1}>
                <Text style={styles.summaryCount}>{summary.count}</Text> {copy.pieces} · {formatUsdt(summary.total)} USDT
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.selectedList}
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => [styles.listButton, pressed && styles.pressedSoft]}
              >
                <Ionicons name="list" size={24} color="#050505" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={confirmOrder}
                style={({ pressed }) => [styles.confirmButton, pressed && styles.pressedSoft]}
              >
                <Text style={styles.confirmText}>{copy.confirm}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.readyBlock}>
            <TextInput
              accessibilityLabel={copy.ready}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setPasted}
              placeholder={copy.paste}
              placeholderTextColor="#8A8A8A"
              style={[styles.pasteInput, styles.textLtr]}
              textAlignVertical="top"
              value={pasted}
            />
            <Pressable
              accessibilityRole="button"
              onPress={applyReadyList}
              style={({ pressed }) => [styles.applyButton, pressed && styles.pressedSoft]}
            >
              <Text style={styles.confirmText}>{copy.apply}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.bottomNav}>
          {TAB_ORDER.map((tab) => {
            const active = tab.id === "store";
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onTabPress(tab.id)}
                style={({ pressed }) => [styles.navItem, pressed && styles.pressedSoft]}
              >
                <View style={active ? styles.activeIndicator : styles.inactiveIndicator} />
                <Ionicons name={tab.icon} size={27} color={active ? "#050505" : "#858585"} />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{copy[tab.id]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
        transparent
        visible={sheetOpen}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet}>
          <Text style={[styles.sheetTitle, rtl ? styles.textRtl : styles.textLtr]}>{copy.selectedList}</Text>
          <ScrollView style={styles.sheetScroll}>
            {selectedItems.length === 0 ? (
              <Text style={styles.emptyText}>{copy.needSelection}</Text>
            ) : (
              selectedItems.map((item) => (
                <View key={item.id} style={[styles.sheetLine, rowDirection]}>
                  <Text style={[styles.sheetLineName, rtl ? styles.textRtl : styles.textLtr]}>
                    {item.name} × {quantities[item.id]}
                  </Text>
                  <Text style={styles.sheetLinePrice}>
                    {formatUsdt((quantities[item.id] ?? 0) * FOOD_PRICE_USDT)} USDT
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
          {selectedItems.length > 0 ? (
            <View style={[styles.sheetLine, rowDirection]}>
              <Text style={styles.sheetTotal}>{copy.total}</Text>
              <Text style={styles.sheetTotal}>{formatUsdt(summary.total)} USDT</Text>
            </View>
          ) : null}
          <View style={[styles.sheetActions, rowDirection]}>
            {selectedItems.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setQuantities({});
                  setSheetOpen(false);
                }}
                style={({ pressed }) => [styles.sheetButton, pressed && styles.pressedSoft]}
              >
                <Text style={styles.sheetButtonText}>{copy.reset}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setSheetOpen(false)}
              style={({ pressed }) => [styles.sheetButton, styles.sheetButtonLight, pressed && styles.pressedSoft]}
            >
              <Text style={styles.sheetButtonLightText}>{copy.close}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 520,
    flex: 1,
    alignSelf: "center",
    backgroundColor: "#FAFAFA",
  },
  titleRow: {
    minHeight: 84,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  rowReverse: {
    flexDirection: "row-reverse",
  },
  backButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F0",
  },
  pageTitle: {
    flex: 1,
    color: "#050505",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
  },
  balancePill: {
    height: 46,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 9,
    backgroundColor: "#0C0C0C",
  },
  balanceText: {
    color: "#FFFFFF",
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "800",
  },
  modeRow: {
    flexDirection: "row",
    columnGap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  modeButton: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
    backgroundColor: "#EFEFEF",
  },
  modeButtonActive: {
    backgroundColor: "#050505",
  },
  modeText: {
    flexShrink: 1,
    color: "#050505",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  modeTextActive: {
    color: "#FFFFFF",
  },
  searchInput: {
    height: 54,
    marginHorizontal: 14,
    paddingHorizontal: 20,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#E3E3E3",
    backgroundColor: "#FFFFFF",
    color: "#050505",
    fontSize: 16,
  },
  list: {
    flex: 1,
    marginTop: 12,
    marginHorizontal: 12,
    marginBottom: 0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#ECECEC",
    backgroundColor: "#FFFFFF",
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
  },
  imageBox: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    rowGap: 2,
  },
  itemName: {
    color: "#050505",
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "800",
  },
  itemPrice: {
    color: "#777777",
    fontSize: 12.5,
    lineHeight: 18,
  },
  alignEnd: {
    alignSelf: "flex-end",
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  minusButton: {
    backgroundColor: "#F0F0F0",
  },
  plusButton: {
    backgroundColor: "#000000",
  },
  quantityInput: {
    width: 52,
    height: 40,
    padding: 0,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#E3E3E3",
    backgroundColor: "#FFFFFF",
    color: "#050505",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyText: {
    padding: 24,
    color: "#8A8A8A",
    fontSize: 15,
    textAlign: "center",
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
  },
  summaryText: {
    flex: 1,
    color: "#050505",
    fontSize: 15,
    fontWeight: "700",
  },
  summaryCount: {
    fontSize: 22,
    fontWeight: "900",
  },
  listButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F0",
  },
  confirmButton: {
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050505",
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  readyBlock: {
    flex: 1,
    paddingHorizontal: 14,
    rowGap: 12,
  },
  pasteInput: {
    flex: 1,
    maxHeight: 320,
    minHeight: 180,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#E3E3E3",
    backgroundColor: "#FFFFFF",
    color: "#050505",
    fontSize: 15,
  },
  applyButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050505",
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "75%",
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FAFAFA",
  },
  sheetTitle: {
    color: "#050505",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 6,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  sheetLineName: {
    flex: 1,
    color: "#050505",
    fontSize: 15,
    fontWeight: "700",
  },
  sheetLinePrice: {
    color: "#050505",
    fontSize: 14,
    fontWeight: "700",
  },
  sheetTotal: {
    color: "#050505",
    fontSize: 17,
    fontWeight: "900",
  },
  sheetActions: {
    flexDirection: "row",
    columnGap: 10,
    marginTop: 16,
  },
  sheetButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050505",
  },
  sheetButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  sheetButtonLight: {
    backgroundColor: "#EFEFEF",
  },
  sheetButtonLightText: {
    color: "#050505",
    fontSize: 15,
    fontWeight: "800",
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
