import dayjs from 'dayjs';

/**
 * 금액을 원화 형식으로 포맷 (1,234,567).
 * null/undefined는 '0'을 반환한다.
 */
export const formatCurrency = (value: number | null | undefined): string => {
  if (value == null) return '0';
  return value.toLocaleString('ko-KR');
};

/**
 * 금액 포맷 (테이블 render용 별칭).
 * formatCurrency와 동일하게 동작한다.
 */
export const formatAmount = (value: number | null | undefined): string => {
  if (value == null) return '0';
  return value.toLocaleString('ko-KR');
};

/** Formats a Korean business registration number as 123-45-67890. */
export const formatBusinessNo = (value: string | null | undefined): string => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length !== 10) return value ?? '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

/**
 * Blob 데이터를 파일로 다운로드.
 * 서버에서 blob 응답을 받은 뒤 브라우저 다운로드를 트리거한다.
 */
export const downloadBlob = (data: Blob | unknown, fileName: string): void => {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * 금액 + '원' 표시 (예: 1,234,567원).
 */
export const formatCurrencyWon = (value: number | null | undefined): string => {
  return `${formatCurrency(value)}원`;
};

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷.
 */
export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD');
};

/**
 * 날짜시간을 YYYY-MM-DD HH:mm 형식으로 포맷.
 */
export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD HH:mm');
};

/**
 * 날짜시간을 YYYY-MM-DD HH:mm:ss 형식으로 포맷.
 */
export const formatDateTimeFull = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
};
