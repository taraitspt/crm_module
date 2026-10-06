-- 첫 로그인 1회용 비밀번호 (2026-10-06 보안 점검 C1).
-- ERP 동기화로 만든 계정은 모두 같은 초기 비밀번호를 받았고 그 값이 로그인 화면에 안내돼 있었다. 이제 새 계정은 아무도 모르는 무작위 비밀번호 +
-- initial_login_pending=1 로 만들어지고, 로그인하려면 [비밀번호 분실]로 Teams 1회용 비밀번호를 받아야 한다(받으면 플래그가 풀리고 강제 변경으로 이어진다).
ALTER TABLE users ADD COLUMN IF NOT EXISTS initial_login_pending TINYINT(1) NOT NULL DEFAULT 0 COMMENT '첫 로그인 대기 — 1 이면 어떤 비밀번호로도 로그인 불가, Teams 1회용 비밀번호를 받아야 시작';

-- 아직 옛 공통 초기 비밀번호 그대로인 계정은 전부 첫 로그인 대기로 돌린다(비밀번호를 한 번이라도 바꾼 사람은 해당 없음).
UPDATE users SET initial_login_pending = 1 WHERE password = '$2a$12$QXhqnMTekjwjBypVhveZIemFPYOxtoV3nWUVWUmORx2hvByan1thi';
