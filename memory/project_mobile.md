---
name: blyss-mobile project
description: React Native / Expo mobile app scaffolded at ../blyss-mobile — full port of the web app
type: project
---

A complete Expo mobile app has been scaffolded at `/Users/nozito/Developer/Jsproject/blyss-mobile`.

**Why:** Full port of the blyss-app web project to React Native for iOS/Android distribution.

**How to apply:** When the user asks about the mobile app, refer to this directory and the architecture below.

## Key differences from web
- **Auth**: JWT stored in `expo-secure-store` (not HttpOnly cookies) + sent as `Authorization: Bearer` header. Backend must accept Bearer tokens OR a cookie-jar lib is needed.
- **Navigation**: Expo Router v4 (file-based) replacing React Router 6
- **Styling**: NativeWind v4 replacing Tailwind CSS web
- **Maps**: react-native-maps replacing Leaflet
- **Animations**: react-native-reanimated replacing Framer Motion
- **Payments**: @stripe/stripe-react-native replacing Stripe JS
- **Subscriptions**: react-native-purchases replacing RevenueCat JS

## Screens created
- `(auth)/`: login, register, forgot-password
- `(client)/`: index (home), specialists, my-bookings, favorites, profile, settings, notifications, payments, booking
- `(pro)/`: dashboard, calendar, clients, services, profile, finance, notifications, settings, subscription
- `(admin)/`: dashboard, users, bookings, analytics
- `specialist/[id].tsx`, `booking/[id].tsx`

## Status (as of 2026-05-05)
Scaffolded — not yet installed or run. Next steps:
1. `cd blyss-mobile && npm install`
2. Add placeholder assets (icon.png, splash.png)
3. Copy `.env.example` → `.env.local` and fill values
4. Consider adding Bearer token support to backend
5. Run `npx expo start`
