import React from 'react';
import ReactDOM from 'react-dom/client';
// Pretendard 웹폰트(가변·동적 서브셋) — 디자인 시스템 기본 폰트. 없으면 시스템 폰트로 fallback 되어
// 화면마다 폰트가 달라 보였다(맑은 고딕 / 위하고 Noto Sans KR 혼재).
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './index.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
