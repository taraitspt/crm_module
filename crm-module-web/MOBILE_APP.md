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
npm run app:android
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
| 로컬에서 폰 테스트(임시 HTTPS) | 터미널 ① `run-local.ps1`(백엔드) ② `npm run build && npx vite preview --port 4173` ③ `npx cloudflared tunnel --url http://localhost:4173` → 폰에서 `https://…trycloudflare.com/app` |

## 커밋 대상

`android/`, `ios/` 는 Capacitor 가 만든 네이티브 프로젝트라 커밋한다(각자 .gitignore 가 빌드 산출물을 뺀다). APK 와 `public/downloads/` 는 산출물이라 커밋하지 않는다.
