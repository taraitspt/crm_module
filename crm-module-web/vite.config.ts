import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import dns from 'dns';
import fs from 'fs';

/**
 * APK 다운로드(/downloads/*.apk) 를 올바른 종류로 내려준다.
 * 기본 정적 서버는 .apk 의 Content-Type 을 몰라 비워 보내고, 그러면 폰이 zip 으로 오인해 `tara-crm.apk.zip` 으로 저장한다.
 * dev(5173)·preview(4173) 둘 다 적용. 운영 nginx 는 nginx.conf 의 types 로 같은 일을 한다.
 */
function apkDownloadPlugin(): Plugin {
  const serve = (root: string): import('vite').Connect.NextHandleFunction => (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    if (!url.startsWith('/downloads/') || !url.endsWith('.apk')) return next();
    const file = path.join(root, url);
    if (!fs.existsSync(file)) return next();
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file)}"`);
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'apk-download',
    configureServer(s) { s.middlewares.use(serve(path.resolve(__dirname, 'public'))); },
    configurePreviewServer(s) { s.middlewares.use(serve(path.resolve(__dirname, 'dist'))); },
  };
}

// Node 18+ 에서 IPv4 우선 사용 (프록시 ECONNREFUSED 방지)
dns.setDefaultResultOrder('ipv4first');

/** 프록시 대상 기본값 — 로컬 백엔드(:8080).
 *  CRM 전용 서버가 생기면 .env.local 의 VITE_API_TARGET 으로 지정한다.
 *  (구 GROW/SM 운영 도메인을 기본값으로 두면 로컬 작업이 운영 데이터를 건드릴 수 있어 제거함) */
const DEFAULT_API_TARGET = 'http://localhost:8080';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || DEFAULT_API_TARGET;
  console.log(`[vite] /api → ${apiTarget}`);

  return {
    plugins: [
      react(),
      apkDownloadPlugin(),
      /**
       * 설치형 웹앱(PWA). 시작 화면은 모바일 앱(/m) — PC 메뉴 전체가 아니라 폰에서 쓰는 네 화면만.
       * 앱 껍데기(js/css/html/아이콘)만 미리 캐시하고 /api 는 캐시하지 않는다(ERP·CRM 데이터는 항상 네트워크).
       */
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'TARA TPS 영업관리',
          short_name: '영업관리',
          description: '타라티피에스 영업관리 모바일 — 영업활동·거래처·관리 필요 거래처·매출현황',
          lang: 'ko',
          start_url: '/m',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#0096A2',
          background_color: '#FFFFFF',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // 활동 알림 웹 푸시 — push/notificationclick 처리는 public/push-sw.js 에
          importScripts: ['push-sw.js'],
          navigateFallback: '/index.html',
          // /downloads(APK)는 서비스워커가 index.html 로 바꿔치기하면 다운로드 버튼이 안 움직인다 — 네트워크로 그대로 보낸다
          navigateFallbackDenylist: [/^\/api\//, /^\/swagger/, /^\/actuator/, /^\/downloads\//],
          // 폰트(Pretendard 동적 서브셋 수백 파일)는 프리캐시에서 빼고 쓸 때 캐시한다.
          globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
          // antd + recharts 청크가 2MB 를 넘어 기본 한도(2MB)로는 프리캐시에서 빠진다.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\.(?:woff2?|ttf)$/i,
              handler: 'CacheFirst',
              options: { cacheName: 'fonts', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // 폰 테스트용 임시 HTTPS 터널(cloudflared quick tunnel) 도메인 허용 — 없으면 "Blocked request. This host is not allowed".
    preview: { allowedHosts: ['.trycloudflare.com'] },
    server: {
      port: 5173,
      allowedHosts: ['.trycloudflare.com'],
      // 백엔드 API 프록시 설정
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          timeout: 10 * 60 * 1000,
          proxyTimeout: 10 * 60 * 1000,
          configure: (proxy) => {
            proxy.on('error', (err: any, _req, res) => {
              console.error('[Proxy Error]', err.code, err.message, JSON.stringify(err.address), err.port);
            });
            proxy.on('proxyReq', (_proxyReq, req) => {
              console.log('[Proxy →]', req.method, req.url);
            });
          },
        },
      },
    },
  };
});
