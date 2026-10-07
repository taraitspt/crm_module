import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 안드로이드 앱(APK) 설정 — Capacitor 로 모바일 앱(/m)을 감싼다.
 *
 * 앱은 "껍데기"다: 화면을 APK 안에 넣지 않고 서버의 /m 을 그대로 불러온다(server.url).
 * 그래서 화면을 고치면 서버 배포만으로 앱에 반영되고, APK 를 다시 만드는 건 서버 주소가 바뀔 때뿐이다.
 *
 * 서버 주소는 빌드할 때 환경변수로 준다:
 *   $env:CAP_SERVER_URL = 'https://crm.taratps.com'; npx cap sync android; cd android; .\gradlew.bat assembleDebug
 * 없으면 아래 기본값(CRM 운영 도메인, 2026-10-07)을 쓴다. 로컬 테스트로 임시 터널을 쓸 때만 CAP_SERVER_URL 로 덮어쓴다 —
 * 터널 주소는 켤 때마다 바뀌므로 실사용 APK 에는 넣지 않는다.
 */
const serverUrl = process.env.CAP_SERVER_URL || 'https://crm.taratps.com';

const config: CapacitorConfig = {
  appId: 'com.taratps.crm',
  appName: 'TARA 영업관리',
  webDir: 'capacitor-shell',   // 빈 껍데기 — dist 를 넣으면 빌드 결과(이전 APK 포함)가 APK 에 들어가 수십 MB 가 된다,
  server: {
    url: `${serverUrl.replace(/\/$/, '')}/m`,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
