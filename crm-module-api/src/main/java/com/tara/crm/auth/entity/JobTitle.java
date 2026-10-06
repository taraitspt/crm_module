package com.tara.crm.auth.entity;

import java.util.List;

/**
 * 직책(users.job_title) 코드 목록 — 값은 한글 그대로 저장한다(ERP 직책 매핑 ErpJobTitle 도 같은 문자열을 만든다).
 * 조직 구성: 매니저 → 파트장/센터장 → 팀장 → 본부장(임원) → 대표이사 → 회장. HRM(인사평가) 과 같은 목록이다(2026-10-06 이식).
 * 역할(Role)은 시스템 권한, 직책은 조직상 위치다 — CRM 은 직책이 바뀌어도 역할을 따라 바꾸지 않는다.
 * 관리자가 사용자 관리에서 바꾸고(본인 프로필에서는 못 바꾼다), ERP 동기화는 비어 있을 때만 채운다.
 */
public final class JobTitle {

    public static final String MANAGER = "매니저";
    public static final String PART_LEADER = "파트장";
    public static final String CENTER_LEADER = "센터장";
    public static final String TEAM_LEADER = "팀장";
    public static final String DIVISION_HEAD = "본부장";
    public static final String CEO = "대표이사";
    public static final String CHAIRMAN = "회장";

    /** 낮은 직책부터 */
    public static final List<String> ALL = List.of(MANAGER, PART_LEADER, CENTER_LEADER, TEAM_LEADER, DIVISION_HEAD, CEO, CHAIRMAN);

    private JobTitle() {}

    public static boolean isValid(String title) {
        return title != null && ALL.contains(title);
    }
}
