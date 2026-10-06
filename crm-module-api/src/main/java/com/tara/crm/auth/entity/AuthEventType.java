package com.tara.crm.auth.entity;

/** 인증 이력 종류 — auth_history.event_type 값(VARCHAR). 실패·잠금·해제는 HRM 에서 이식(2026-10-06). */
public enum AuthEventType {
    LOGIN,
    PASSWORD_CHANGED,
    /** 비밀번호 불일치. 누가 남의 계정을 두드리는지 보기 위해 남긴다. */
    LOGIN_FAILED,
    /** 연속 실패 한도를 넘겨 잠김 */
    LOCKED,
    /** 관리자가 잠금을 풀어 줌 */
    UNLOCKED
}
