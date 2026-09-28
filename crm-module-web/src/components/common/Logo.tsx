import React from 'react';
import logoUrl from '@/assets/brand/tara-logo.png';

interface LogoProps {
  /** 로고 렌더 높이(px). 기본 22. 폭은 원본 비율(약 5.45:1)로 자동. */
  size?: number;
  /** (호환용) 과거 "Module" 보조 블록 토글. 로고에 워드마크가 포함되어 더는 쓰이지 않음. */
  showText?: boolean;
  /** (호환용) 배경 톤. 현재는 원본 로고를 색·배경 변형 없이 그대로 사용한다. */
  tone?: 'dark' | 'light';
  className?: string;
}

/** 트림된 원본 PNG 종횡비(676×124). 폭을 명시 계산해야 column-flex 부모의
 *  align-items:stretch 가 width:auto 이미지를 가로로 늘리는 왜곡을 막는다. */
const LOGO_RATIO = 676 / 124;

/**
 * 타라티피에스 공식 로고 — 올빼미 심볼 + "tara" + "타라티피에스" 워드마크 락업.
 * 투명 배경 원본 PNG 를 **색·배경 변형 없이 그대로** 렌더한다(틸 올빼미 + 네이비 워드마크).
 */
const Logo: React.FC<LogoProps> = ({ size = 22, className }) => (
  <img
    src={logoUrl}
    alt="타라티피에스"
    draggable={false}
    className={className}
    style={{
      height: size,
      width: Math.round(size * LOGO_RATIO),
      display: 'block',
      flexShrink: 0,
      userSelect: 'none',
    }}
  />
);

export default Logo;
