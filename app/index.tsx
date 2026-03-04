import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import WebView from "react-native-webview";
import { useSmartWallet } from "@hooks/useSmartWallet";
import { useWalletConnection } from "@hooks/useWalletConnection";
import { useWebViewMessage } from "@hooks/useWebViewMessage";
import { useWebViewInsets } from "@hooks/useWebViewInsets";
import { DEFAULT_APP_URL, DEFAULT_DEV_URL } from "@constants/index";
import { log } from "@utils/log";

const STORAGE_KEY = "openrun:webview-url";

const normalizeUrl = (rawValue: string): string | null => {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const valueWithProtocol = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  try {
    return new URL(valueWithProtocol).toString();
  } catch {
    return null;
  }
};

const getUrlLabel = (url: string): "PROD" | "NGROK" | "CUSTOM" => {
  if (url === DEFAULT_APP_URL) {
    return "PROD";
  }

  if (url === DEFAULT_DEV_URL) {
    return "NGROK";
  }

  return "CUSTOM";
};

export default function HomeScreen() {
  const { disconnectWallet } = useSmartWallet();
  const webViewRef = useRef<WebView>(null);
  const currentUrlRef = useRef(DEFAULT_APP_URL);
  const hasAutoRecoveredDevUrlRef = useRef(false);
  const hasManualUrlSelectionRef = useRef(false);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_APP_URL);
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(DEFAULT_DEV_URL);
  const [customUrlError, setCustomUrlError] = useState<string | null>(null);
  const [webViewError, setWebViewError] = useState<string | null>(null);

  const postMessage = (message: any) => {
    log("POST MESSAGE TO WEBVIEW", message);
    webViewRef.current?.postMessage(JSON.stringify(message));
  };

  const { address, handleConnectRequest } = useWalletConnection({ postMessage });
  const { handleMessage } = useWebViewMessage({
    address,
    disconnectWallet,
    handleConnectRequest,
    postMessage,
  });
  const { handleLoadEnd } = useWebViewInsets({ postMessage });
  const currentUrlLabel = useMemo(() => getUrlLabel(currentUrl), [currentUrl]);

  const saveAndApplyUrl = useCallback(async (nextUrl: string, closePanel = false) => {
    const shouldReloadCurrentPage = nextUrl === currentUrl;
    hasManualUrlSelectionRef.current = true;

    setCurrentUrl(nextUrl);
    setCustomUrlInput(nextUrl);
    setCustomUrlError(null);
    log("WEBVIEW_URL_APPLY", { from: currentUrl, to: nextUrl, shouldReloadCurrentPage });

    try {
      await AsyncStorage.setItem(STORAGE_KEY, nextUrl);
    } catch (error) {
      log("WEBVIEW_URL_SAVE_ERROR", error);
    }

    if (shouldReloadCurrentPage) {
      webViewRef.current?.reload();
    }

    if (closePanel) {
      setIsDebugPanelOpen(false);
    }
  }, [currentUrl]);

  const closeDebugPanel = useCallback(() => {
    setIsDebugPanelOpen(false);
    setCustomUrlError(null);
  }, []);

  const openDebugPanel = useCallback(() => {
    setCustomUrlInput(currentUrl);
    setCustomUrlError(null);
    setIsDebugPanelOpen(true);
  }, [currentUrl]);

  const applyCustomUrl = useCallback(async () => {
    const normalized = normalizeUrl(customUrlInput);
    if (!normalized) {
      setCustomUrlError("URL 형식이 올바르지 않습니다. (예: https://open-run.vercel.app)");
      return;
    }

    await saveAndApplyUrl(normalized, true);
  }, [customUrlInput, saveAndApplyUrl]);

  const recoverToProductionUrl = useCallback(async () => {
    await saveAndApplyUrl(DEFAULT_APP_URL);
    setWebViewError(null);
  }, [saveAndApplyUrl]);

  const reloadWebView = useCallback(() => {
    setWebViewError(null);
    webViewRef.current?.reload();
  }, []);

  const onWebViewLoadEnd = useCallback(
    () => {
      setWebViewError(null);
      handleLoadEnd();
    },
    [handleLoadEnd]
  );

  const onNavigationStateChange = useCallback((navigationState: { url?: string }) => {
    log("WEBVIEW_NAVIGATION_URL", navigationState?.url);
  }, []);

  const onShouldStartLoadWithRequest = useCallback(
    (request: { url?: string }) => {
      const requestUrl = request?.url;
      if (!requestUrl) {
        return true;
      }

      const isRequestNgrok = requestUrl.includes("ngrok");
      const isCurrentNgrok = currentUrl.includes("ngrok");
      if (isRequestNgrok && !isCurrentNgrok) {
        log("WEBVIEW_BLOCK_UNEXPECTED_NGROK_NAVIGATION", {
          requestUrl,
          currentUrl,
        });
        return false;
      }

      return true;
    },
    [currentUrl]
  );

  const onWebViewError = useCallback(
    (event: any) => {
      const description = event?.nativeEvent?.description ?? "알 수 없는 네트워크 에러";
      const failingUrl = event?.nativeEvent?.url ?? currentUrl;
      const message = `로드 실패: ${description} (${failingUrl})`;
      setWebViewError(message);
      log("WEBVIEW_LOAD_ERROR", event?.nativeEvent);
    },
    [currentUrl]
  );

  const onWebViewHttpError = useCallback((event: any) => {
    const statusCode = event?.nativeEvent?.statusCode;
    const failingUrl = event?.nativeEvent?.url ?? currentUrl;
    const isFailingUrlNgrok = typeof failingUrl === "string" && failingUrl.includes("ngrok");
    const isCurrentUrlNgrok = currentUrl.includes("ngrok");

    if (isFailingUrlNgrok && !isCurrentUrlNgrok) {
      log("WEBVIEW_HTTP_ERROR_IGNORED_STALE_NGROK", event?.nativeEvent);
      return;
    }

    const isNgrokUnavailable =
      statusCode === 404 &&
      isFailingUrlNgrok &&
      !hasAutoRecoveredDevUrlRef.current;

    if (isNgrokUnavailable) {
      hasAutoRecoveredDevUrlRef.current = true;
      setWebViewError(`Ngrok URL에 연결할 수 없어 배포 URL로 자동 전환합니다. (${failingUrl})`);
      log("WEBVIEW_HTTP_ERROR_AUTO_RECOVER", event?.nativeEvent);
      void saveAndApplyUrl(DEFAULT_APP_URL);
      return;
    }

    const message = `HTTP ${statusCode ?? "?"} 에러 (${failingUrl})`;
    setWebViewError(message);
    log("WEBVIEW_HTTP_ERROR", event?.nativeEvent);
  }, [currentUrl, saveAndApplyUrl]);

  useEffect(() => {
    currentUrlRef.current = currentUrl;
  }, [currentUrl]);

  useEffect(() => {
    if (typeof currentUrl === "string" && !currentUrl.includes("ngrok")) {
      hasAutoRecoveredDevUrlRef.current = false;
    }
  }, [currentUrl]);

  useEffect(() => {
    let isMounted = true;

    const loadStoredUrl = async () => {
      try {
        const storedUrl = await AsyncStorage.getItem(STORAGE_KEY);
        const normalized = storedUrl ? normalizeUrl(storedUrl) : null;

        if (
          isMounted &&
          normalized &&
          !hasManualUrlSelectionRef.current &&
          currentUrlRef.current === DEFAULT_APP_URL
        ) {
          log("WEBVIEW_URL_RESTORED", normalized);
          setCurrentUrl(normalized);
          setCustomUrlInput(normalized);
        }
      } catch (error) {
        log("WEBVIEW_URL_LOAD_ERROR", error);
      }
    };

    loadStoredUrl();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.safearea}>
      <WebView
        key={currentUrl}
        ref={webViewRef}
        source={{ uri: currentUrl }}
        geolocationEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        onMessage={handleMessage}
        onLoadEnd={onWebViewLoadEnd}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onError={onWebViewError}
        onHttpError={onWebViewHttpError}
        startInLoadingState
        renderLoading={() => <></>}
        allowsBackForwardNavigationGestures
        bounces={false}
        overScrollMode="never"
        allowsLinkPreview={false}
        webviewDebuggingEnabled
      />

      {webViewError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerTitle}>WebView 연결 오류</Text>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            {webViewError}
          </Text>
          <Pressable style={styles.recoverButton} onPress={recoverToProductionUrl}>
            <Text style={styles.recoverButtonText}>배포 URL로 복구</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable style={styles.debugChip} onPress={openDebugPanel}>
        <Text style={styles.debugChipText}>URL {currentUrlLabel}</Text>
      </Pressable>

      <Modal visible={isDebugPanelOpen} transparent animationType="fade" onRequestClose={closeDebugPanel}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeDebugPanel} />

          <View style={styles.panelContainer}>
            <Text style={styles.panelTitle}>WebView URL 전환</Text>
            <Text style={styles.panelCurrentUrl} numberOfLines={2}>
              현재: {currentUrl}
            </Text>

            <Pressable style={styles.reloadButton} onPress={reloadWebView}>
              <Text style={styles.reloadButtonText}>웹 새로고침</Text>
            </Pressable>

            <View style={styles.presetRow}>
              <Pressable
                style={[
                  styles.presetButton,
                  currentUrlLabel === "PROD" && styles.presetButtonActive,
                ]}
                onPress={() => saveAndApplyUrl(DEFAULT_APP_URL, true)}
              >
                <Text
                  style={[
                    styles.presetButtonText,
                    currentUrlLabel === "PROD" && styles.presetButtonTextActive,
                  ]}
                >
                  배포 URL
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.presetButton,
                  currentUrlLabel === "NGROK" && styles.presetButtonActive,
                ]}
                onPress={() => saveAndApplyUrl(DEFAULT_DEV_URL, true)}
              >
                <Text
                  style={[
                    styles.presetButtonText,
                    currentUrlLabel === "NGROK" && styles.presetButtonTextActive,
                  ]}
                >
                  Ngrok URL
                </Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              value={customUrlInput}
              onChangeText={setCustomUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://..."
              placeholderTextColor="#94A3B8"
            />

            {customUrlError ? <Text style={styles.errorText}>{customUrlError}</Text> : null}

            <View style={styles.actionRow}>
              <Pressable style={[styles.actionButton, styles.cancelButton]} onPress={closeDebugPanel}>
                <Text style={styles.cancelButtonText}>닫기</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.applyButton]} onPress={applyCustomUrl}>
                <Text style={styles.applyButtonText}>커스텀 적용</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safearea: {
    flex: 1,
  },
  debugChip: {
    position: "absolute",
    top: 48,
    right: 12,
    zIndex: 20,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  debugChipText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  errorBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 96,
    zIndex: 25,
    backgroundColor: "rgba(127, 29, 29, 0.94)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  errorBannerTitle: {
    color: "#FEE2E2",
    fontSize: 13,
    fontWeight: "700",
  },
  errorBannerText: {
    color: "#FECACA",
    fontSize: 12,
    lineHeight: 16,
  },
  recoverButton: {
    marginTop: 2,
    alignSelf: "flex-start",
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recoverButtonText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "700",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 64,
    paddingBottom: 16,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.38)",
  },
  panelContainer: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 12,
  },
  panelTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "700",
  },
  panelCurrentUrl: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 18,
  },
  reloadButton: {
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F9FF",
  },
  reloadButtonText: {
    color: "#1E40AF",
    fontSize: 13,
    fontWeight: "700",
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  presetButtonActive: {
    borderColor: "#1D4ED8",
    backgroundColor: "#EFF6FF",
  },
  presetButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
  },
  presetButtonTextActive: {
    color: "#1D4ED8",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
    fontSize: 14,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  cancelButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "600",
  },
  applyButton: {
    backgroundColor: "#1D4ED8",
  },
  applyButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
