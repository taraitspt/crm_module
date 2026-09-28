package com.tara.crm.common.util;

/**
 * 데이터를 어디까지 보는가.
 *
 * NONE : 아무것도 못 봄
 * SELF : 본인이 담당자인 건만
 * DEPT : 본인이 속한 부서(dept_cd) 구성원의 건
 * ALL  : 전체
 *
 * 역할에 고정된 값이 아니라 리소스(데이터 종류)별로 다르다.
 * 실제 값은 resource_scope 테이블에 있고 관리자 화면에서 바꾼다 — {@link com.tara.crm.common.menu.ResourceScopeService}.
 *
 * 부서 계층(up_dept_cd)이 대부분 비어 있어 DEPT 는 같은 dept_cd 평면으로만 넓힌다.
 * 상위 부서 롤업이 필요해지면 departments.up_dept_cd 를 채운 뒤 ScopeService 만 바꾸면 된다.
 */
public enum DataScope {
    NONE, SELF, DEPT, ALL;

    /** 문자열 → 범위. 모르는 값이면 가장 좁은 쪽으로 붙인다. */
    public static DataScope parse(String v) {
        if (v == null) return SELF;
        try {
            return valueOf(v.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return SELF;
        }
    }
}
