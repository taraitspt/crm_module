import React from 'react';
import Logo from './Logo';
import { T } from '@/theme/designTokens';

interface BrandedLoaderProps {
  /** 보조 안내 문구. 기본 "불러오는 중". */
  label?: string;
  /** 전체 화면(100vh) 여부. 라우트 폴백=true, 인라인 영역=false. */
  fullscreen?: boolean;
}

/**
 * 브랜드 로딩 화면 — 제네릭 스피너 대신 타라 로고 + TARA GREEN 인디터미네이트 바.
 * Datadog/Linear 류의 절제된 로딩 표현. 라우트 Suspense 폴백 및 페이지 로딩에 공용.
 * 모션은 prefers-reduced-motion 을 존중한다(접근성).
 */
const BrandedLoader: React.FC<BrandedLoaderProps> = ({ label = '불러오는 중', fullscreen = true }) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 22,
      height: fullscreen ? '100vh' : '100%',
      minHeight: fullscreen ? '100vh' : 280,
      width: '100%',
      background: T.bg,
    }}
  >
    {/* 로고 — 은은한 진입(fade+scale) 후 호흡(breathe) 루프 */}
    <div className="sm-loader-mark">
      <Logo size={38} showText tone="light" />
    </div>

    {/* Steel Teal 인디터미네이트 바 — 트랙 위를 teal 세그먼트가 왕복 */}
    <div className="sm-loader-track" aria-hidden="true">
      <span className="sm-loader-bar" />
    </div>

    <span style={{ fontSize: 12, color: T.t4, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>
      {label}
      <span className="sm-loader-dots" aria-hidden="true" />
    </span>

    <style>{`
      .sm-loader-mark {
        animation: smLoaderIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both,
                   smLoaderBreathe 2.4s ease-in-out 0.5s infinite;
        transform-origin: center;
      }
      .sm-loader-track {
        position: relative;
        width: 188px;
        height: 3px;
        border-radius: 2px;
        background: ${T.border1};
        overflow: hidden;
      }
      .sm-loader-bar {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 42%;
        border-radius: 2px;
        background: linear-gradient(90deg, ${T.primary100}, ${T.primary} 55%, ${T.primary700});
        animation: smLoaderSlide 1.15s cubic-bezier(0.65, 0, 0.35, 1) infinite;
      }
      .sm-loader-dots::after {
        content: '';
        animation: smLoaderDots 1.4s steps(4, end) infinite;
      }
      @keyframes smLoaderIn {
        from { opacity: 0; transform: translateY(6px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes smLoaderBreathe {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.72; }
      }
      @keyframes smLoaderSlide {
        0%   { left: -42%; }
        100% { left: 100%; }
      }
      @keyframes smLoaderDots {
        0%   { content: ''; }
        25%  { content: '.'; }
        50%  { content: '..'; }
        75%  { content: '...'; }
        100% { content: ''; }
      }
      @media (prefers-reduced-motion: reduce) {
        .sm-loader-mark { animation: smLoaderIn 0.3s ease both; }
        .sm-loader-bar { animation: smLoaderSlide 1.8s linear infinite; }
        .sm-loader-dots::after { animation: none; content: '…'; }
      }
    `}</style>
  </div>
);

export default BrandedLoader;
