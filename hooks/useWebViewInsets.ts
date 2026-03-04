import { useRef, useCallback, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Message } from "@constants/message";
import { log } from "@utils/log";

interface UseWebViewInsetsProps {
  postMessage: (message: any) => void;
}

/**
 * WebView에 inset 값을 전달하는 훅
 */
export function useWebViewInsets({ postMessage }: UseWebViewInsetsProps) {
  const insets = useSafeAreaInsets();
  const hasLoadedRef = useRef<boolean>(false);
  const lastSentInsetsRef = useRef<{ top: number; bottom: number } | null>(null);
  const retryTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearRetryTimeouts = useCallback(() => {
    retryTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    retryTimeoutsRef.current = [];
  }, []);

  const sendInsets = useCallback((force = false) => {
    const insetData = {
      top: insets.top,
      bottom: insets.bottom,
    };

    if (
      !force &&
      lastSentInsetsRef.current?.top === insetData.top &&
      lastSentInsetsRef.current?.bottom === insetData.bottom
    ) {
      return;
    }

    log("📱 [Native] Sending inset values to WebView:", insetData);
    postMessage({
      type: Message.INSET,
      data: insetData,
    });
    lastSentInsetsRef.current = insetData;
  }, [insets.top, insets.bottom, postMessage]);

  const handleLoadEnd = useCallback(() => {
    hasLoadedRef.current = true;
    clearRetryTimeouts();
    sendInsets(true);

    // RN WebView 로드 직후엔 웹 앱이 아직 hydration 중일 수 있어 짧게 재전송한다.
    retryTimeoutsRef.current = [300, 900, 1800].map((delay) =>
      setTimeout(() => {
        sendInsets(true);
      }, delay)
    );
  }, [clearRetryTimeouts, sendInsets]);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      return;
    }

    sendInsets();
  }, [sendInsets]);

  useEffect(() => {
    return () => {
      clearRetryTimeouts();
    };
  }, [clearRetryTimeouts]);

  return { handleLoadEnd };
}
