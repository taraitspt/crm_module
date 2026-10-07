-- auth_history.event_type 을 VARCHAR 로 되돌린다 (2026-10-07).
-- V107 은 VARCHAR(30) 로 만들었지만 실제 DB(로컬·운영 모두)에선 ENUM('LOGIN','PASSWORD_CHANGED') 로 바뀌어 있었다(SM 시절 경로로 추정).
-- V155(로그인 잠금)가 LOGIN_FAILED / LOCKED / UNLOCKED 를 넣으면 "Data truncated for column 'event_type'" 로 실패해
-- 비밀번호를 틀린 로그인이 "비밀번호 불일치" 대신 500 이 되고, 연속 실패 잠금도 동작하지 않았다.
ALTER TABLE auth_history
    MODIFY COLUMN event_type VARCHAR(30) NOT NULL COMMENT 'LOGIN/PASSWORD_CHANGED/LOGIN_FAILED/LOCKED/UNLOCKED';
