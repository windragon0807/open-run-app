# Open Run App

## Table of Contents

- [Introduction](#introduction)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Run](#run)
- [Architecture](#architecture)
  - [WebView Bridge](#webview-bridge)
  - [Wallet Connection](#wallet-connection)
- [About](#about)

## Introduction

**Open Run** 프로젝트의 React Native (Expo) 기반 모바일 앱입니다. WebView를 통해 프론트엔드 웹앱(`https://open-run.vercel.app`)을 래핑하고, 네이티브 기능(지갑 연결, 위치 정보, 햅틱 피드백)을 브릿지로 제공합니다.

## Tech Stack

| 영역 | 기술 |
|------|------|
| Framework | React Native 0.81 + Expo SDK 54 |
| Language | TypeScript 5.9 |
| Routing | Expo Router 6 |
| Wallet | Reown AppKit (WalletConnect) + Wagmi 3 |
| Chain | Base Mainnet / Base Sepolia |
| State | TanStack React Query 5 |
| Native | expo-location, expo-haptics, expo-crypto |

## Project Structure

```
app/
├── app/
│   ├── _layout.tsx          # Root layout (AppKit, Wagmi, QueryClient Provider)
│   └── index.tsx            # HomeScreen (WebView)
├── hooks/
│   ├── useSmartWallet.ts    # 지갑 연결/해제 로직
│   ├── useWalletConnection.ts # 연결 상태 관리 및 자동 재시도
│   ├── useAppStateListener.ts # 앱 foreground/background 상태 감지
│   ├── useWebViewInsets.ts  # Safe area inset 전달
│   └── useWebViewMessage.ts # WebView ↔ Native 메시지 핸들러
├── utils/
│   ├── geolocation.ts       # 위치 정보 요청
│   ├── vibration.ts         # 햅틱 피드백 실행
│   └── log.ts               # 플랫폼별 컬러 로깅
├── constants/
│   ├── index.ts             # URL 상수
│   └── message.ts           # 메시지 타입 및 진동 타입 enum
├── appKitConfig.ts          # Reown AppKit / Wagmi 설정
├── polyfills.js             # URL, WebCrypto polyfill
├── index.ts                 # Expo Router entry
├── app.json                 # Expo 설정
├── eas.json                 # EAS Build 설정
└── babel.config.js          # Babel 설정
```

## Development

### Prerequisites

- Node.js 18+
- npm 또는 yarn
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS: Xcode (시뮬레이터 또는 실기기)
- Android: Android Studio (에뮬레이터 또는 실기기)

### Installation

```bash
cd app
npm install
```

### Run

```bash
# Expo 개발 서버 시작
npm start

# iOS
npm run ios

# Android
npm run android

# Web
npm run web
```

개발 시 로컬 프론트엔드를 사용하려면 `constants/index.ts`에서 `URL`을 `DevURL`로 변경하세요.

## Architecture

### WebView Bridge

앱은 WebView를 통해 프론트엔드 웹앱과 JSON 메시지 기반으로 통신합니다.

**메시지 타입:**

| 방향 | 메시지 | 설명 |
|------|--------|------|
| Web → Native | `REQUEST_SMART_WALLET_CONNECT` | 지갑 연결 요청 |
| Native → Web | `RESPONSE_SMART_WALLET_CONNECT` | 지갑 주소 응답 |
| Native → Web | `RESPONSE_SMART_WALLET_CONNECT_ERROR` | 연결 에러 |
| Web → Native | `DISCONNECT_SMART_WALLET` | 지갑 연결 해제 |
| Native → Web | `WALLET_MODAL_CLOSED` | 모달 닫힘 알림 |
| Web → Native | `REQUEST_GEOLOCATION` | 위치 정보 요청 |
| Native → Web | `GEOLOCATION` / `GEOLOCATION_ERROR` | 위치 정보 응답 |
| Web → Native | `REQUEST_VIBRATION` | 햅틱 피드백 요청 |
| Native → Web | `INSET` | Safe area inset 전달 |

### Wallet Connection

Reown AppKit (WalletConnect v2)을 통해 지갑에 연결합니다.

- **지원 체인:** Base Mainnet, Base Sepolia
- **지원 지갑:** MetaMask, Trust Wallet, Binance Wallet, Coinbase Wallet
- **소셜 로그인:** Google, Apple, Discord, X, GitHub, Farcaster
- **자동 재시도:** 지갑 앱에서 돌아왔을 때 모달이 닫힌 경우 최대 2회 자동 재시도

## About

Credit to @open-run
