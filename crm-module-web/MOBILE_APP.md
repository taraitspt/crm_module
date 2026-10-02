# 모바일 앱 (TARA 영업관리)

폰에서 쓰는 네 화면(영업활동 · 거래처 카드 · 관리 필요 거래처 · 매출현황)을 세 가지 모양으로 제공한다. 셋 다 **같은 코드(`src/pages/mobile/`, 주소 `/m`)** 를 보여주고, 다른 건 포장뿐이다.

| 모양 | 어떻게 설치 | 상태 |
|---|---|---|
| 브라우저 / 홈 화면 추가 (PWA) | `https://서버/m` 열고 Chrome ⋮ → 홈 화면에 추가, Safari 공유 → 홈 화면에 추가 | 완료 |
| 안드로이드 APK | `https://서버/app` 에서 APK 다운로드 → 설치 | 완료 (디버그 서명) |
| 아이폰 앱 | App Store(비공개 링크) 또는 TestFlight | Xcode 프로젝트까지 준비. **빌드는 Mac + Apple 개발자 계정 필요** |

설치 안내 페이지 `/app` 은 로그인 없이 열린다. 이 링크 하나를 배포하면 된다.

## 구조

- 네이티브 앱(APK/iOS)은 **껍데기**다. `capacitor.config.ts` 의 `server.url` 이 가리키는 서버의 `/m` 을 WebView 로 불러온다.
  - 화면을 고치면 **서버 배포만** 하면 앱에 반영된다. APK 를 다시 만드는 건 서버 주소가 바뀔 때뿐.
  - 로그인·API 는 웹과 완전히 같다(JWT, `/api`).
- 서버 주소는 빌드 시 환경변수 `CAP_SERVER_URL` 로 준다. 없으면 `capacitor.config.ts` 의 기본값(로컬 테스트용 터널 주소)을 쓴다.
- 앱이 서버를 불러오려면 **서버가 HTTPS 고정 주소**여야 한다. 로컬 터널(`cloudflared`)은 켤 때마다 주소가 바뀌어 테스트용으로만 쓴다.

## 안드로이드 APK 만들기

사전 준비(이 PC에는 되어 있음): **JDK 21**(Capacitor 8 요구 — 백엔드의 17 과 별개로 설치, 빌드할 때만 `JAVA_HOME` 을 21 로), Android SDK (`C:\Android\Sdk`, 환경변수 `ANDROID_HOME`; 필요한 플랫폼·빌드툴은 Gradle 이 첫 빌드 때 받는다).
다른 PC 라면 Android Studio 없이 명령줄 도구만 깔면 된다:
```powershell
# https://developer.android.com/studio#command-line-tools-only 의 zip 을 C:\Android\Sdk\cmdline-tools\latest 에 풀고
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk --licenses
C:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat --sdk_root=C:\Android\Sdk platform-tools "platforms;android-34" "build-tools;34.0.0"
[Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Android\Sdk', 'User')
```

빌드:
```powershell
cd crm-module-web
$env:JAVA_HOME = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' | Select-Object -First 1).FullName
$env:CAP_SERVER_URL = 'https://crm.example.com'   # 실제 서버 주소. 생략하면 config 기본값
npm run app:android   # scripts/build-apk.cjs — cap sync → gradlew assembleDebug → downloads 복사 (셸 종류 무관)
```
`android/app/build/outputs/apk/debug/app-debug.apk` 가 만들어지고 `public/downloads/tara-crm.apk`(그리고 dist 가 있으면 `dist/downloads/`)로 복사된다. 그다음 `npm run build` 로 배포본을 만들면 `/downloads/tara-crm.apk` 로 내려받을 수 있다.

- 지금은 **디버그 서명** APK 다. 사내 배포(링크로 설치)는 이걸로 충분하다. Play 스토어에 올리려면 서명키를 만들어 `assembleRelease` 로 바꿔야 한다(`android/app/build.gradle` 의 signingConfigs).
- 폰에서 처음 설치할 때 "출처를 알 수 없는 앱" 허용이 한 번 필요하다(스토어 밖 설치라서).

아이콘·스플래시는 `assets/logo.png`(1024, 흰 배경)·`assets/logo-dark.png` 에서 `npm run app:assets` 로 다시 만든다.

## 아이폰

애플은 링크/파일로 앱을 설치하는 걸 허용하지 않는다. 선택지는 둘뿐이다.

1. **홈 화면에 추가 (지금 가능)** — Safari 에서 `/m` 열고 공유 → 홈 화면에 추가. 아이콘·전체 화면은 앱과 같다. `/app` 페이지가 이 방법을 안내한다.
2. **App Store / TestFlight** — Mac 에서 `ios/App/App.xcodeproj` 를 Xcode 로 열어 빌드. 필요한 것:
   - Apple Developer Program (연 $99)
   - Mac + Xcode. 처음 열기 전에 `cd ios/App && pod install` (CocoaPods) 또는 Xcode 의 Swift Package 해석
   - Xcode: Signing & Capabilities 에서 팀 선택 → Product → Archive → Distribute
   - TestFlight: 초대 링크로 설치, 빌드는 90일마다 갱신. App Store: 심사 후 **비공개(Unlisted) 링크**로 배포하면 검색에 노출되지 않는다
   - 서버 주소는 안드로이드와 같이 `CAP_SERVER_URL` 로 두고 `npx cap sync ios`

## 자주 쓰는 명령

| 할 일 | 명령 |
|---|---|
| 설정(`capacitor.config.ts`)·웹 변경을 네이티브 프로젝트에 반영 | `npm run app:sync` |
| APK 빌드 + 다운로드 폴더 복사 | `npm run app:android` |
| 아이콘·스플래시 재생성 | `npm run app:assets` |
| 로컬에서 폰 테스트(임시 HTTPS) | 저장소 루트에서 `powershell -ExecutionPolicy Bypass -File .\start-phone-test.ps1` — 백엔드·배포본 preview(4173)·cloudflared 창 3개를 열고 폰에서 열 주소(`…/app`)를 출력·클립보드 복사. `-Dev` 면 개발 서버(5174, 설치 불가), `-NoTunnel` 이면 PC 만 |

## 커밋 대상

`android/`, `ios/` 는 Capacitor 가 만든 네이티브 프로젝트라 커밋한다(각자 .gitignore 가 빌드 산출물을 뺀다). APK 와 `public/downloads/` 는 산출물이라 커밋하지 않는다.


## 활동 알림 (앱 자체 알림, 2026-10-02)

- 폰 앱(APK)에서 **활동일 아침 8시**에 그날 활동 제목을 알림으로 띄운다. 서버 푸시·Firebase 없이 `@capacitor/local-notifications` **로컬 알림**으로 한다.
- 동작: 앱을 열 때·다시 앞으로 올 때·활동을 저장/삭제할 때 내 활동(오늘~30일)을 받아 폰 안에 예약하고, 서버에 없어진 예약은 지운다(`src/pages/mobile/activityReminders.ts`). 알림 id = activityId. PC 에서 등록한 활동도 폰 앱을 한 번 열면 예약된다.
- 켜고 끄기: 모바일 상단 사용자 메뉴 "활동 알림 (아침 8시)". 로그아웃하면 예약을 지운다.
- 한계: 네이티브 앱 안에서만 된다. 아이폰 "홈 화면에 추가"(PWA)는 로컬 알림이 없어 서버 웹 푸시가 따로 필요하다(미구현). 안드로이드 13+ 는 첫 실행 때 알림 권한을 묻는다.
- 플러그인을 넣은 뒤라 **APK 를 다시 만들어 배포해야** 알림이 동작한다(`npm run app:android`).

### 아이폰(홈 화면 웹앱)·브라우저 — 웹 푸시
- 아이폰은 Apple 개발자 계정 없이는 네이티브 앱을 못 깔므로 **Safari "홈 화면에 추가" 웹앱(iOS 16.4+)에 웹 푸시(VAPID)** 로 보낸다. 무료. 안드로이드 Chrome PWA·데스크톱 브라우저도 같은 길.
- 서버: `push_subscription`(V150) · `/api/push/*`(공개키·구독·해지·테스트·관리자 즉시발송) · `ActivityReminderScheduler` 가 매일 08:00(Asia/Seoul) 그날 활동을 담당자 구독으로 보낸다(5건 넘으면 "외 n건"). 앱을 안 열어도 온다.
- 키: `.env.local` 의 `WEBPUSH_PUBLIC_KEY` / `WEBPUSH_PRIVATE_KEY` / `WEBPUSH_SUBJECT`(생성 `npx web-push generate-vapid-keys`). **한 번 만든 키를 운영에도 그대로** — 바꾸면 모든 폰이 알림을 다시 허용해야 한다. 비우면 웹 푸시만 꺼진다.
- 폰: 홈 화면 앱으로 열면 "활동 알림 받기" 배너 또는 사용자 메뉴 "활동 알림"에서 켠다(권한 요청은 사용자 탭에서만 가능). 서비스워커 푸시 처리는 `public/push-sw.js`(vite `workbox.importScripts`).
- 구독은 도메인에 묶인다 — 터널 주소가 바뀌거나 운영 도메인으로 옮기면 전원 재허용. 안드로이드 APK 는 WebView 라 웹 푸시를 못 받고 로컬 알림을 쓴다(둘이 겹쳐 두 번 오지 않게 APK 에선 웹 푸시 메뉴를 숨긴다).


## 안드로이드 뒤로가기 (2026-10-02)
WebView 는 탭 이동을 "돌아갈 기록"으로 안 쳐서 어느 탭에서든 뒤로가기에 앱이 바로 꺼졌다. `@capacitor/app` 의 backButton 을 받아 규칙으로 처리한다(MobileLayout): 탭 아래 화면 → 이전 화면(없으면 그 탭) / 활동 이외 탭 → 활동 탭 / 활동 탭 → "앱을 종료할까요?" 확인 후 종료. 리스너를 달면 Capacitor 기본 동작이 꺼지므로 모든 경우를 직접 처리해야 한다. 플러그인 추가라 APK 재빌드 필요.

## APK 크기 (2026-10-02)
`webDir` 는 `capacitor-shell/`(빈 index.html). 전에는 `dist/` 라서 `dist/downloads/tara-crm.apk` 까지 APK 안에 들어가 24MB → 47MB 로 불어났다. 껍데기 앱은 server.url 화면만 쓰므로 번들 자산이 필요 없다.
