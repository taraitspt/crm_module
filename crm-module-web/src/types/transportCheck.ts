/**
 * 운송정보 부서 점검 — ERP 운송정보입력(SD_TRSPEXPE_INFO_X20329) 행의 부서(→ 비용센터)와, 같은 주문 라인(주문번호·순번)에 걸린
 * 수주 라인 비용센터(SD_SO_DTL.CC_CD)를 대조. 운송정보엔 비용센터가 없고 부서만 있어 부서의 비용센터로 비교한다. 서버가 판정(deptMatch)을 붙인다.
 */
export type TransportRow = Record<string, string | number | null | undefined>;

export interface TransportCol {
  id: string;
  label: string;
  width: number;
  kind?: 'num' | 'date' | 'match';
  align?: 'right' | 'center';
  fixed?: 'left';
}
const tx = (id: string, label: string, width: number): TransportCol => ({ id, label, width });
const num = (id: string, label: string, width = 90): TransportCol => ({ id, label, width, kind: 'num', align: 'right' });
const dt = (id: string, label: string, width = 100): TransportCol => ({ id, label, width, kind: 'date', align: 'center' });

export const TRANSPORT_COLS: TransportCol[] = [
  { ...tx('insertNo', '등록번호', 150), fixed: 'left' },
  { id: 'deptMatch', label: '판정', width: 100, kind: 'match', align: 'center' },
  dt('insertDt', '등록일'),
  dt('issDt', '출고일'),
  tx('orddocNo', '주문번호', 150),
  { ...tx('orddocSq', '순번', 50), align: 'center' },
  { ...tx('dlvSq', '납품순번', 70), align: 'center' },
  tx('orddocNm', '주문명', 220),
  tx('bizrsptEmpnoNm', '영업담당(운송)', 110),
  tx('deptNm', '부서(운송)', 110),
  tx('deptCcNm', '부서 비용센터', 120),
  tx('deptCcCd', '부서 CC', 70),
  tx('sodocNo', '수주번호', 150),
  tx('soCcNm', '수주 비용센터', 120),
  tx('soCcCd', '수주 CC', 70),
  tx('soEmpnoNm', '수주 담당자', 100),
  { ...tx('empSame', '담당 동일', 70), align: 'center' },
  num('soCnt', '수주 수', 60),
  tx('saleprtnNm', '영업거래처', 160),
  tx('delivPlace', '납품처', 140),
  num('issQt', '출고수량'),
  tx('spcfcsItemNm', '세부품목', 200),
  tx('trnspagencyCd', '운송사', 70),
  tx('delivTp', '운송방법', 80),
  { ...tx('confirmYn', '확정', 50), align: 'center' },
  tx('destBaseAddr', '도착지', 220),
  tx('rmkDc', '비고', 160),
];

export const DEPT_MATCH: Record<string, { label: string; color: string; desc: string }> = {
  MISMATCH: { label: '불일치', color: 'error', desc: '운송정보 부서의 비용센터 ≠ 수주 라인 비용센터' },
  MATCH: { label: '일치', color: 'success', desc: '운송정보 부서의 비용센터 = 수주 라인 비용센터' },
  NO_SO: { label: '수주 없음', color: 'default', desc: '이 주문 라인에 아직 수주가 없음 — 운송정보가 수주보다 먼저 들어가므로 보통은 정상' },
  SO_MIXED: { label: '수주 CC 상이', color: 'processing', desc: '같은 주문 라인의 수주 라인들끼리 비용센터가 다름 — 수주를 직접 확인' },
  NO_DEPT_CC: { label: '부서 CC 없음', color: 'warning', desc: '운송정보 부서에 비용센터가 없거나 등록일 기준으로 유효한 부서가 아님' },
};

export const fmtNum = (v?: string | number | null) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
};
