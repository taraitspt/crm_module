/**
 * 주문번호 표시용 포맷 (실제 번호 생성은 백엔드에서 수행).
 * 프론트엔드에서는 표시용으로만 사용한다.
 *
 * 형식: O{YYMMDD}-{부서코드4자리}-{일련번호5자리}
 * 예: O260303-0040-00001
 */
export const formatOrderNo = (orderNo: string): string => {
  return orderNo; // 이미 포맷된 상태로 서버에서 내려옴
};

/**
 * 숫자를 지정된 자릿수로 패딩.
 * 예: padNumber(42, 5) → '00042'
 */
export const padNumber = (num: number, length: number): string => {
  return String(num).padStart(length, '0');
};

/**
 * 문자열에서 숫자만 추출.
 * 금액 입력 필드에서 콤마 제거 등에 사용.
 */
export const extractNumber = (value: string): number => {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * 퍼센트 계산 (소수점 1자리).
 * 예: calcPercentage(75, 100) → 75.0
 */
export const calcPercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 1000) / 10;
};
