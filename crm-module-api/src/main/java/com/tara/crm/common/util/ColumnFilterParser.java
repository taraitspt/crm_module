package com.tara.crm.common.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;

import java.util.List;

/**
 * 목록 헤더 컬럼필터 JSON 파싱 — 7개 컨트롤러가 공유한다.
 *
 * <p>컬럼필터 DTO 는 도메인마다 따로(OrderDto.ColumnFilter, SalesDto…, PoDto…) 있어
 * 타입만 다르고 파싱 로직은 같았다. 그 복붙을 한곳으로 모으고 ObjectMapper 도 재사용한다(2026-09-04).
 *
 * <p>형식이 깨지면 400 으로 돌려준다 — 조용히 무시하면 화면엔 필터 아이콘이 켜져 있는데
 * 전체가 나오는 "걸린 것처럼 보이는 미적용" 상태가 된다.
 */
public final class ColumnFilterParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ColumnFilterParser() {}

    /** 비어 있으면 null(필터 없음), 형식이 깨지면 400. */
    public static <T> List<T> parse(String json, TypeReference<List<T>> typeRef) {
        if (json == null || json.isBlank()) return null;
        try {
            return MAPPER.readValue(json, typeRef);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "컬럼 필터 형식이 올바르지 않습니다: " + e.getMessage());
        }
    }
}
