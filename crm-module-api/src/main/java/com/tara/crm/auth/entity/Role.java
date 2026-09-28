package com.tara.crm.auth.entity;

/**
 * 사용자 역할.
 * ADMIN: 관리자권한 (시스템 전체)
 * EXECUTIVE: 임원
 * FINANCE: 회계운영팀
 * TEAM_LEADER: 팀장
 * PART_LEADER: 파트장
 * SALES_SPT: 영업지원
 * CENTER_LEADER: 센터장 — 권한은 SALES_SPT 와 동일하게 취급.
 * MANAGER: 일반권한(매니저)
 * STAFF: 일반권한 — 영업담당자 아님(목표입력 등 영업 전용 메뉴엔 노출 안 함)
 */
public enum Role {
    ADMIN,
    EXECUTIVE,
    MANAGER,
    TEAM_LEADER,
    PART_LEADER,
    FINANCE,
    SALES_SPT,
    CENTER_LEADER,
    STAFF
}
