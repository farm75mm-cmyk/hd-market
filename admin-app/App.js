import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

const URL = "https://hd-market-api-production.up.railway.app/admin";

export default function App() {
  const web = useRef(null);
  const [canBack, setCanBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canBack && web.current) {
        web.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canBack]);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    web.current?.reload();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.title}>غير متصل بالإنترنت</Text>
          <Text style={styles.sub}>تحقق من الاتصال ثم حاول مرة أخرى.</Text>
          <Pressable style={styles.btn} onPress={retry}>
            <Text style={styles.btnText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          ref={web}
          source={{ uri: URL }}
          style={styles.web}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          onNavigationStateChange={(s) => setCanBack(s.canGoBack)}
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setFailed(true)}
        />
      )}
      {loading && !failed ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color="#e8a900" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  web: { flex: 1, backgroundColor: "#f4f4f2" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f4f2", padding: 24 },
  title: { fontSize: 20, fontWeight: "800", color: "#111", marginBottom: 8 },
  sub: { fontSize: 15, color: "#555", marginBottom: 20, textAlign: "center" },
  btn: { backgroundColor: "#e8a900", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { fontWeight: "800", color: "#111", fontSize: 16 },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
