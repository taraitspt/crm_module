package com.tara.crm.common.util;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.core.types.dsl.StringExpression;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.function.Function;

/**
 * 목록 헤더 컬럼필터의 술어(WHERE 조각) 생성 — 주문·매출·발주·정산이 공유한다.
 *
 * <p>같은 로직이 4개 레포지토리에 복붙돼 있던 것을 한곳으로 모았다(2026-09-04).
 * 컬럼 id → 표현식 매핑과 도메인 특수 규칙(주문의 순번 EXISTS, 매출의 salesType/payType 병행 매칭,
 * 정산의 집계 HAVING 등)은 각 레포지토리에 그대로 둔다 — 여기 모으는 것은 "연산자 해석"뿐이다.
 *
 * <p>프론트 matchesFilter() 와 의미를 맞춘다: 텍스트는 양쪽 소문자 비교, 다중값은 OR(제외는 AND),
 * NULL 은 빈 문자열로 취급.
 */
public final class ColumnFilterPredicates {

    private ColumnFilterPredicates() {}

    /** 금액 입력값 파싱 — 콤마/공백 허용. 숫자가 아니면 null(= 조건 없음). */
    public static Long parseAmount(String v) {
        if (!StringUtils.hasText(v)) return null;
        try { return Long.parseLong(v.replace(",", "").trim()); }
        catch (NumberFormatException e) { return null; }
    }

    /**
     * 텍스트 컬럼 술어. 조건이 없으면 null 을 돌려준다.
     *
     * @param op CONTAINS(기본) | EQUALS | NOT_CONTAINS
     * @param vals 검색어들(공백 제거·빈값 제외된 상태)
     */
    public static BooleanBuilder text(StringExpression str, String op, List<String> vals, Boolean excludeBlank) {
        BooleanBuilder b = new BooleanBuilder();
        if (Boolean.TRUE.equals(excludeBlank)) b.and(str.isNotNull().and(str.trim().ne("")));
        if (vals == null || vals.isEmpty()) return b.hasValue() ? b : null;

        String o = op == null ? "CONTAINS" : op.toUpperCase();
        var lower = str.lower();
        if ("NOT_CONTAINS".equals(o)) {
            // "모든 검색어를 포함하지 않음"(AND). NULL 은 통과 — 프론트가 빈 문자열로 보기 때문.
            for (String v : vals) b.and(lower.contains(v.toLowerCase()).not().or(str.isNull()));
        } else {
            // CONTAINS / EQUALS — 검색어 중 하나라도 맞으면 통과(OR).
            BooleanBuilder or = new BooleanBuilder();
            for (String v : vals) {
                String lv = v.toLowerCase();
                or.or("EQUALS".equals(o) ? lower.eq(lv) : lower.contains(lv));
            }
            b.and(or);
        }
        return b;
    }

    /**
     * 금액(숫자) 컬럼 술어. 조건이 없으면 null.
     *
     * @param op GTE(기본) | LTE | BETWEEN
     * @param v1 하한(LTE 면 기준값), v2 상한(BETWEEN 에서만)
     */
    public static BooleanBuilder amount(NumberExpression<?> num, String op, String v1, String v2, Boolean excludeBlank) {
        BooleanBuilder b = new BooleanBuilder();
        Long a = parseAmount(v1);
        Long hi = parseAmount(v2);
        String o = op == null ? "GTE" : op.toUpperCase();
        switch (o) {
            case "LTE"     -> { if (a != null) b.and(num.loe(a)); }
            case "BETWEEN" -> {
                if (a != null) b.and(num.goe(a));
                if (hi != null) b.and(num.loe(hi));
            }
            default        -> { if (a != null) b.and(num.goe(a)); }   // GTE
        }
        if (Boolean.TRUE.equals(excludeBlank)) b.and(num.isNotNull());
        return b.hasValue() ? b : null;
    }

    /**
     * 날짜 컬럼 술어 — 화면 표기(YYYY-MM-DD) 부분입력을 날짜 비교로 바꾼다.
     *
     * <p>컬럼이 단일 경로가 아닐 수 있어(예: 정산 주문일자 = 주문 접수일 ?? 발주 접수일)
     * 표현식 대신 매처 함수를 받는다. 매처가 null 을 돌려주면 해석 불가로 본다.
     *
     * @param matcher 입력 문자열 → 날짜 일치 조건. 해석 불가면 null.
     * @param notNull 값이 있는 행 조건(빈값 제외·제외조건에서 사용)
     */
    public static BooleanBuilder date(Function<String, BooleanExpression> matcher, BooleanExpression notNull,
                                      String op, List<String> vals, Boolean excludeBlank) {
        BooleanBuilder b = new BooleanBuilder();
        if (Boolean.TRUE.equals(excludeBlank)) b.and(notNull);
        if (vals == null || vals.isEmpty()) return b.hasValue() ? b : null;

        String o = op == null ? "CONTAINS" : op.toUpperCase();
        if ("NOT_CONTAINS".equals(o)) {
            for (String v : vals) {
                var m = matcher.apply(v);
                if (m != null) b.and(m.not().or(notNull.not()));
            }
        } else {
            BooleanBuilder or = new BooleanBuilder();
            for (String v : vals) {
                var m = matcher.apply(v);
                if (m != null) or.or(m);
            }
            // 해석되는 입력이 하나도 없으면 0건 — 조용히 전체를 보여주지 않는다.
            b.and(or.hasValue() ? or
                    : new BooleanBuilder(com.querydsl.core.types.dsl.Expressions.FALSE));
        }
        return b;
    }
}
