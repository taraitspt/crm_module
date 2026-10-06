/**
 * 수주 담당팀 점검 — 수주 라인의 비용센터(SD_SO_DTL.CC_CD; 거래처 기본 CC 는 참고 열)와 영업담당자의 실제 소속(ERP 사원정보 CC, 없으면 CRM users.cc_cd — empCcSrc)을 대조.
 * 해외영업2팀 담당자가 1팀 CC 로 수주를 올리는 식의 오등록을 찾는다. 서버가 판정(ccMatch)까지 붙여 Map(camelCase)으로 내려준다.
 */
export type SoCcRow = Record<string, string | number | null | undefined>;

export interface SoCcCol {
  id: string;
  label: string;
  width: number;
  kind?: 'num' | 'date' | 'match';
  align?: 'right' | 'center';
  fixed?: 'left';
}
const tx = (id: string, label: string, width: number): SoCcCol => ({ id, label, width });
const num = (id: string, label: string, width = 110): SoCcCol => ({ id, label, width, kind: 'num', align: 'right' });
const dt = (id: string, label: string, width = 100): SoCcCol => ({ id, label, width, kind: 'date', align: 'center' });

export const SO_CC_COLS: SoCcCol[] = [
  { ...tx('sodocNo', '수주번호', 150), fixed: 'left' },
  { id: 'ccMatch', label: '판정', width: 90, kind: 'match', align: 'center' },
  dt('soDt', '수주일'),
  tx('bizrsptEmpnoNm', '영업담당', 80),
  tx('bizrsptEmpnoCd', '사번', 90),
  tx('ccNm', '수주 비용센터', 130),
  tx('ccCd', '수주 CC', 80),
  tx('partnerCcNm', '거래처 기본 CC', 130),
  tx('empCcNm', '담당자 소속 CC', 130),
  tx('empCcCd', '담당자 CC', 80),
  { ...tx('empCcSrc', '출처', 56), align: 'center' },
  tx('empDeptNm', '담당자 부서', 110),
  tx('saleprtnNm', '판매처', 170),
  tx('purdocNo', '주문번호', 150),
  tx('orddocNm', '주문명', 220),
  num('lineCnt', '수주라인', 70),
  tx('ordDeptNm', '주문 부서', 110),
  num('soAmt', '수주금액'),
  tx('soTpNm', '수주유형', 100),
  { ...tx('soSt', '상태', 56), align: 'center' },
  tx('salesorgnNm', '판매조직', 110),
  tx('plantNm', '공장', 100),
  tx('rmkDc', '비고', 200),
];

export const CC_MATCH: Record<string, { label: string; color: string; desc: string }> = {
  MISMATCH: { label: '불일치', color: 'error', desc: '수주의 비용센터가 담당자 소속 비용센터와 다름 — 오등록 의심' },
  MATCH: { label: '일치', color: 'success', desc: '수주 비용센터 = 담당자 소속' },
  MIXED: { label: '라인별 상이', color: 'processing', desc: '한 수주 안에서 라인마다 비용센터가 다름 — 수주 라인을 직접 확인' },
  NO_USER: { label: '담당자 미등록', color: 'warning', desc: '담당 사번이 ERP 사원·CRM 사용자 어디에도 없음' },
  NO_CC: { label: '소속 CC 없음', color: 'default', desc: '담당자의 비용센터가 ERP 사원정보에도 CRM 사용자에도 없음' },
};

export const fmtAmt = (v?: string | number | null) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
};
