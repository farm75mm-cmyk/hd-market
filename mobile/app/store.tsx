import Ionicons from "@expo/vector-icons/Ionicons";
import { Image, type ImageSource } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AXE_ITEMS } from "@/lib/axe-data";
import { FOOD_ITEMS } from "@/lib/food-data";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth-server";
import { ScreenContainer } from "@/components/screen-container";
import {
  formatStoreClock,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/store-utils";

type Locale = SupportedLocale;
type TabId = "account" | "support" | "chat" | "wallet" | "store";
type CategoryId = "products" | "farms" | "axe" | "tools" | "food";

type StoreCopy = {
  store: string;
  sections: string;
  account: string;
  support: string;
  chat: string;
  wallet: string;
  products: string;
  farms: string;
  axe: string;
  tools: string;
  food: string;
  oneItem: string;
  zeroItems: string;
  noNotifications: string;
  comingSoon: string;
};

const COPY: Record<Locale, StoreCopy> = {
  ar: {
    store: "المتجر",
    sections: "الأقسام",
    account: "حسابي",
    support: "الدعم",
    chat: "الدردشة",
    wallet: "المحفظة",
    products: "المنتجات",
    farms: "المزارع",
    axe: "فأس",
    tools: "الأدوات حضيرة",
    food: "Food",
    oneItem: "1 عنصر",
    zeroItems: "0 عنصر",
    noNotifications: "لا توجد إشعارات جديدة.",
    comingSoon: "سيتم إضافة هذه الصفحة قريبًا.",
  },
  en: {
    store: "Store",
    sections: "Categories",
    account: "Account",
    support: "Support",
    chat: "Chat",
    wallet: "Wallet",
    products: "Products",
    farms: "Farms",
    axe: "Axe",
    tools: "Barn tools",
    food: "Food",
    oneItem: "1 item",
    zeroItems: "0 items",
    noNotifications: "There are no new notifications.",
    comingSoon: "This page will be added soon.",
  },
  vi: {
    store: "Cửa hàng",
    sections: "Danh mục",
    account: "Tài khoản",
    support: "Hỗ trợ",
    chat: "Trò chuyện",
    wallet: "Ví",
    products: "Sản phẩm",
    farms: "Nông trại",
    axe: "Rìu",
    tools: "Dụng cụ kho",
    food: "Food",
    oneItem: "1 mục",
    zeroItems: "0 mục",
    noNotifications: "Không có thông báo mới.",
    comingSoon: "Trang này sẽ sớm được bổ sung.",
  },
  zh: {
    store: "商店",
    sections: "分类",
    account: "我的",
    support: "客服",
    chat: "聊天",
    wallet: "钱包",
    products: "产品",
    farms: "农场",
    axe: "斧头",
    tools: "仓库工具",
    food: "Food",
    oneItem: "1 件",
    zeroItems: "0 件",
    noNotifications: "暂无新通知。",
    comingSoon: "该页面即将上线。",
  },
};

const LOGO = require("@/assets/images/hd-market-logo.png");
const CATEGORY_IMAGES: Record<CategoryId, ImageSource> = {
  products: require("@/assets/images/categories/products.jpg"),
  farms: require("@/assets/images/categories/farms.jpg"),
  axe: require("@/assets/images/categories/axe.jpg"),
  tools: require("@/assets/images/categories/tools.jpg"),
  food: require("@/assets/images/categories/food.jpg"),
};

const CATEGORY_ORDER: CategoryId[] = ["products", "farms", "axe", "tools", "food"];
const TAB_ORDER: { id: TabId; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "account", icon: "person-outline" },
  { id: "support", icon: "headset-outline" },
  { id: "chat", icon: "chatbubble-outline" },
  { id: "wallet", icon: "wallet-outline" },
  { id: "store", icon: "storefront-outline" },
];

export default function StoreScreen() {
  const params = useLocalSearchParams<{ locale?: string | string[] }>();
  const localeParam = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const locale: Locale = isSupportedLocale(localeParam) ? localeParam : "ar";
  const copy = COPY[locale];
  const rtl = locale === "ar";
  const [now, setNow] = useState(() => new Date());
  const [balance, setBalance] = useState(0);
  const [serverCats, setServerCats] = useState<{ id: number; name: string; image: string | null }[]>([]);
  const [prodCount, setProdCount] = useState<Record<number, number>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [acc, cat] = await Promise.all([getSession(), api("catalog")]);
        if (!alive) return;
        if (acc) setBalance(acc.balance);
        setServerCats(cat.categories ?? []);
        const counts: Record<number, number> = {};
        for (const p of cat.products ?? []) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
        setProdCount(counts);
      } catch {
        /* offline handled by the app gate */
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const clock = useMemo(() => formatStoreClock(now), [now]);

  const categoryLabel = (id: CategoryId) => copy[id];
  const unit = locale === "ar" ? "عنصر" : locale === "vi" ? "mục" : locale === "zh" ? "件" : "items";
  const categoryCount = (id: CategoryId) =>
    id === "food" ? `${FOOD_ITEMS.length} ${unit}` : id === "axe" ? `${AXE_ITEMS.length} ${unit}` : id === "farms" ? copy.oneItem : copy.zeroItems;

  const openSoon = (title: string) => {
    Alert.alert(title, copy.comingSoon);
  };

  const renderServerCategory = (c: { id: number; name: string; image: string | null }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={c.name}
      onPress={() => router.push({ pathname: "/category", params: { locale, id: String(c.id), name: c.name } })}
      style={({ pressed }) => [styles.categoryCard, pressed && styles.pressedCard]}
    >
      {c.image ? (
        <Image source={{ uri: c.image }} style={styles.categoryImage} contentFit="cover" />
      ) : (
        <View style={[styles.categoryImage, { backgroundColor: "#EEE" }]} />
      )}
      <View style={styles.categoryInfo}>
        <Text style={[styles.categoryName, rtl ? styles.textRtl : styles.textLtr]}>{c.name}</Text>
        <Text style={[styles.categoryCount, rtl ? styles.textRtl : styles.textLtr]}>
          {prodCount[c.id] ?? 0} {unit}
        </Text>
      </View>
    </Pressable>
  );

  const renderEntry = ({ item }: { item: CategoryId | { id: number; name: string; image: string | null } }) =>
    typeof item === "string" ? renderCategory({ item }) : renderServerCategory(item);

  const renderCategory = ({ item }: { item: CategoryId }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={categoryLabel(item)}
      onPress={() =>
        item === "food"
          ? router.push({ pathname: "/food", params: { locale } })
          : item === "axe"
            ? router.push({ pathname: "/axe", params: { locale } })
            : openSoon(categoryLabel(item))
      }
      style={({ pressed }) => [styles.categoryCard, pressed && styles.pressedCard]}
    >
      <Image source={CATEGORY_IMAGES[item]} style={styles.categoryImage} contentFit="cover" />
      <View style={styles.categoryInfo}>
        <Text style={[styles.categoryName, rtl ? styles.textRtl : styles.textLtr]}>
          {categoryLabel(item)}
        </Text>
        <Text style={[styles.categoryCount, rtl ? styles.textRtl : styles.textLtr]}>
          {categoryCount(item)}
        </Text>
      </View>
    </Pressable>
  );

  const listHeader = (
    <>
      <View style={styles.topHeader}>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.account}
            onPress={() => openSoon(copy.account)}
            style={({ pressed }) => [styles.profileButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name="person-outline" size={28} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.noNotifications}
            onPress={() => Alert.alert(copy.store, copy.noNotifications)}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.wallet}
          onPress={() => router.push({ pathname: "/wallet", params: { locale } })}
          style={({ pressed }) => [styles.balancePill, pressed && styles.pressedSoft]}
        >
          <Ionicons name="wallet-outline" size={22} color="#FFFFFF" />
          <Text style={styles.balanceText}>{balance.toFixed(2)}</Text>
        </Pressable>
        <Text style={[styles.pageTitle, rtl ? styles.textRtl : styles.textLtr]}>{copy.store}</Text>
      </View>

      <View style={styles.divider} />
      <Text style={[styles.sectionTitle, rtl ? styles.textRtl : styles.textLtr]}>
        {copy.sections}
      </Text>
    </>
  );

  return (
    <ScreenContainer
      edges={["top", "bottom", "left", "right"]}
      containerClassName="bg-background"
    >
      <StatusBar style="dark" />
      <View style={styles.page}>
        <FlatList
          data={[...CATEGORY_ORDER, ...serverCats] as (CategoryId | { id: number; name: string; image: string | null })[]}
          renderItem={renderEntry}
          keyExtractor={(item) => (typeof item === "string" ? item : `s${item.id}`)}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.bottomNav}>
          {TAB_ORDER.map((tab) => {
            const active = tab.id === "store";
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (tab.id === "account") {
                    router.replace({ pathname: "/account", params: { locale } });
                    return;
                  }
                  if (tab.id === "wallet") {
                    router.push({ pathname: "/wallet", params: { locale } });
                    return;
                  }
                  if (tab.id === "support" || tab.id === "chat") {
                    router.push({ pathname: "/support", params: { locale } });
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
  listContent: {
    paddingBottom: 18,
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
    minHeight: 84,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
  },
  balancePill: {
    height: 43,
    minWidth: 94,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 9,
    backgroundColor: "#000000",
  },
  balanceText: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  pageTitle: {
    color: "#050505",
    fontSize: 29,
    lineHeight: 38,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    backgroundColor: "#E8E8E8",
  },
  sectionTitle: {
    color: "#858585",
    fontSize: 21,
    lineHeight: 30,
    fontWeight: "700",
    marginTop: 23,
    marginBottom: 13,
    paddingHorizontal: 18,
  },
  gridRow: {
    paddingHorizontal: 14,
    columnGap: 12,
    marginBottom: 13,
  },
  categoryCard: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECECEC",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 5,
  },
  categoryImage: {
    width: "100%",
    aspectRatio: 0.99,
    backgroundColor: "#EFEFEF",
  },
  categoryInfo: {
    minHeight: 80,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: "center",
    rowGap: 3,
  },
  categoryName: {
    color: "#050505",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
  },
  categoryCount: {
    color: "#8A8A8A",
    fontSize: 15,
    lineHeight: 22,
  },
  textRtl: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  textLtr: {
    textAlign: "left",
    writingDirection: "ltr",
  },
  pressedCard: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
  pressedSoft: {
    opacity: 0.62,
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
