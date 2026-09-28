-- 임시 비밀번호로 로그인한 사용자에게 새 비밀번호 설정을 강제하기 위한 플래그.
-- 임시비번 발급 시 1로 세팅, 비밀번호 변경 성공 시 0으로 해제.
ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0;
