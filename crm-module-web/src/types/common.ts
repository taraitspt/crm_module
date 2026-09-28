/** 서버 공통 API 응답 형식 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string | null;
  errorCode: string | null;
  timestamp: string;
}

/** 페이징 응답 */
export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

/** 페이징 요청 파라미터 */
export interface PageParams {
  page?: number;
  size?: number;
  sort?: string;
}

/** 기간 검색 파라미터 */
export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

/** 셀렉트 옵션 (드롭다운용) */
export interface SelectOption {
  label: string;
  value: string | number;
}
