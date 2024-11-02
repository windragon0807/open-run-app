import React, {useRef, useState} from 'react';
import {View, StyleSheet, StatusBar, Platform, Image} from 'react-native';
import {
  WebView,
  WebViewNavigation,
  WebViewMessageEvent,
} from 'react-native-webview';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {Message} from './src/constants/message';

// const WEBVIEW_URL = 'http://localhost:3000';
const WEBVIEW_URL = 'https://open-run.vercel.app';

const getStatusBarHeight = (safeAreaTop: number): number => {
  if (Platform.OS === 'android') {
    return StatusBar.currentHeight || 0;
  }
  return safeAreaTop;
};

function AppContent(): React.JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const statusBarHeight = getStatusBarHeight(insets.top);
  const [showSplash, setShowSplash] = useState(true);

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    console.log('NAVIGATION', navState);
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const data = JSON.parse(event.nativeEvent.data);
    console.info('MESSAGE', data);
    if (data.type === Message.WEBVIEW_READY) {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({statusBarHeight}));
      }
    }

    if (data.type === Message.RENDER_READY) {
      setShowSplash(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />
      <WebView
        ref={webViewRef}
        source={{uri: WEBVIEW_URL}}
        style={styles.webview}
        onNavigationStateChange={onNavigationStateChange}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
      />
      {showSplash && (
        <View style={styles.splashContainer}>
          <Image
            source={require('./src/assets/images/splash.png')}
            style={styles.splashImage}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
}

/* SafeAreaProvider를 하단의 AppContent의 최상단에 적용하면 희한하게 에러가 발생함 */
export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#4A5CEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashImage: {
    width: '100%',
    height: '100%',
  },
});
