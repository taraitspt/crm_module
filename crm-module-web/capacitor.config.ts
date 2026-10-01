import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 안드로이드 앱(APK) 설정 — Capacitor 로 모바일 앱(/m)을 감싼다.
 *
 * 앱은 "껍데기"다: 화면을 APK 안에 넣지 않고 서버의 /m 을 그대로 불러온다(server.url).
 * 그래서 화면을 고치면 서버 배포만으로 앱에 반영되고, APK 를 다시 만드는 건 서버 주소가 바뀔 때뿐이다.
 *
 * 서버 주소는 빌드할 때 환경변수로 준다:
 *   $env:CAP_SERVER_URL = 'https://crm.example.com'; npx cap sync android; cd android; .\gradlew.bat assembleDebug
 * 없으면 아래 기본값(로컬 테스트용 터널 주소)을 쓴다 — 터널을 다시 켜면 주소가 바뀌니 실사용 APK 는 반드시 고정 HTTPS 주소로.
 */
const serverUrl = process.env.CAP_SERVER_URL || 'https://durable-chemicals-merchants-asthma.trycloudflare.com';

const config: CapacitorConfig = {
  appId: 'com.taratps.crm',
  appName: 'TARA 영업관리',
  webDir: 'dist',
  server: {
    url: `${serverUrl.replace(/\/$/, '')}/m`,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
