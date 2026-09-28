import React from 'react';
import { T } from '@/theme/designTokens';

interface PageHeaderProps {
  /** 페이지 제목 (v3: 16px / 700). */
  title: string;
  /** 제목 옆 보조 설명 (12px / 흐림). */
  sub?: React.ReactNode;
  /** 우측 액션 영역 (버튼·업로드 등). */
  actions?: React.ReactNode;
  /** 제목 앞 요소 (예: 뒤로가기 버튼). */
  leading?: React.ReactNode;
  /** 화면별 제목 강조 스타일. */
  titleStyle?: React.CSSProperties;
}

/**
 * v3 슬림 페이지 헤더 — 제목 + 부제 + 우측 액션, 하단 1px 보더.
 * 매출관리 화면들이 공통으로 사용한다 (브레드크럼 아래, 콘텐츠 위).
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, sub, actions, leading, titleStyle }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      minHeight: 40,
      marginBottom: 18,
      paddingBottom: 14,
      borderBottom: `1px solid ${T.border1}`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      {leading}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.t1, letterSpacing: 0, whiteSpace: 'nowrap', ...titleStyle }}>
          {title}
        </span>
        {sub && <span style={{ fontSize: 12, color: T.t4, lineHeight: 1.4 }}>{sub}</span>}
      </div>
    </div>
    {actions && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div>
    )}
  </div>
);

export default PageHeader;
