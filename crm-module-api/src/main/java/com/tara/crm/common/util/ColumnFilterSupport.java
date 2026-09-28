package com.tara.crm.common.util;

import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;

/**
 * 목록 헤더 정렬·컬럼필터의 "서버가 모르는 컬럼" 처리 규칙.
 *
 * <p>종전에는 각 레포지토리가 미지원 컬럼을 만나면 조용히 무시했다(switch default -&gt; null).
 * 그 결과 프론트 화이트리스트와 서버 switch 가 어긋나도 아무 신호가 없었고,
 * 사용자는 "필터를 걸었는데 전체가 나오는" 상태를 보게 됐다.
 * (2026-09-03 정산목록 주문일자·발송완료일 정렬 무반응 — 담당자 문의로야 발견)
 *
 * <p>그래서 미지원 컬럼은 400 으로 거절한다. 프론트가 서버 지원 컬럼만 헤더에 노출하므로
 * 정상 사용에서는 발생하지 않고, 어긋나면 개발 중에 바로 드러난다.
 */
@Slf4j
public final class ColumnFilterSupport {

    private ColumnFilterSupport() {}

    /** 정렬 컬럼이 서버 미지원일 때. sortField 가 비어 있으면(정렬 안 함) 호출하지 않는다. */
    public static void rejectSort(String where, String sortField) {
        log.warn("[{}] 지원하지 않는 정렬 컬럼: {}", where, sortField);
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "정렬할 수 없는 컬럼입니다: " + sortField);
    }

    /** 필터 컬럼이 서버 미지원일 때. */
    public static void rejectFilter(String where, String colId) {
        log.warn("[{}] 지원하지 않는 필터 컬럼: {}", where, colId);
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "필터를 걸 수 없는 컬럼입니다: " + colId);
    }
}
