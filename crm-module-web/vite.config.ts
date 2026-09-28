import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dns from 'dns';

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
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
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
