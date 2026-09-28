-- 시트 #1 — 마이페이지 2차인증 활성화 토글.
ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
