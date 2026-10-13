/**
 * 모바일 앱 / PC 를 가르는 기준 (2026-10-13, 사용자 요청: "앱에서는 모바일 화면만, PC 에서는 PC 화면만").
 *
 * - 모바일 껍데기(shell) = Capacitor 네이티브 앱(APK·iOS) 또는 홈 화면에 추가한 PWA(standalone).
 *   안드로이드 WebView 는 display-mode 가 standalone 이 아니라서 Capacitor 도 같이 본다.
 * - PC 브라우저 = 껍데기가 아니고, 마우스 환경(pointer: fine)이며 폭이 넓다. 폰·태블릿 브라우저(터치)는 PC 로 치지 않는다 —
 *   아이폰은 Safari 에서 /m 을 열어 홈 화면에 추가하는 게 설치 절차라서 /m 을 막으면 안 된다.
 */
export function isMobileShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.() === true) return true;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch { /* matchMedia 없는 환경 */ }
  return (navigator as { standalone?: boolean }).standalone === true;
}

export function isDesktopBrowser(): boolean {
  if (typeof window === 'undefined' || isMobileShell()) return false;
  try {
    return window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 900;
  } catch {
    return window.innerWidth >= 900;
  }
}

/**
 * 모바일 모드 — 앱이면 항상, 폰·태블릿 브라우저(터치)는 /m 을 한 번 연 뒤부터(기기에 기억). 그 뒤엔 로그인·로그아웃·주소 직접 입력
 * 무엇을 해도 모바일 화면만 보인다("모바일에서 무슨 행동을 하든 모바일로만" — 사용자 2026-10-13). 설치 안내(/app)의 [PC 화면] 링크가 기억을 지운다.
 */
const MOBILE_FLAG = 'crm:mobile-mode';
function isTouchDevice(): boolean {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
}
export function rememberMobileMode(): void {
  try { localStorage.setItem(MOBILE_FLAG, '1'); } catch { /* 저장 불가 환경 */ }
}
export function forgetMobileMode(): void {
  try { localStorage.removeItem(MOBILE_FLAG); } catch { /* 저장 불가 환경 */ }
}
export function isMobileMode(): boolean {
  if (isMobileShell()) return true;
  if (typeof window === 'undefined' || !isTouchDevice()) return false;
  try { return localStorage.getItem(MOBILE_FLAG) === '1'; } catch { return false; }
}

/** 앱 안에서 열어도 되는 PC 쪽 경로 — 작업지시서(주문·일정 카드에서 연다), 설치 안내, 인증 화면. */
const SHELL_ALLOWED: RegExp[] = [
  /^\/m(\/|$)/,
  /^\/production\/work-order\//,
  /^\/app(\/|$)/,
  /^\/login(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/force-password-change(\/|$)/,
];

export function allowedInShell(pathname: string): boolean {
  return SHELL_ALLOWED.some((re) => re.test(pathname));
}

/** 로그인·비밀번호 변경 뒤 돌아갈 "홈" — 모바일 모드면 /m, 아니면 PC 매출현황. */
export function homePath(): string {
  return isMobileMode() ? '/m' : '/';
}
