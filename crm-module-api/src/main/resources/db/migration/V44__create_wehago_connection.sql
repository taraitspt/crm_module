-- 위하고(Wehago) 세금계산서 OpenAPI 연동 — SM 사용자별 access_token + 회사 정보 저장.
-- 원래 V41 로 작성했으나 동료의 V41__expand_order_info_note_to_text.sql 와 번호 충돌
-- (Flyway "Found more than one migration with version 41") 발생하여 V44 로 rename (2026-05-29).
-- PoC(C:\Users\user\Desktop\세금계산서발행\wehago-test)에서 OAuth→토큰 발급 흐름 검증 완료.
-- BaseEntity 의 created_at/updated_at/created_id/updated_id 와 같이 JPA Auditing 사용.
-- 각 statement 별도 분리 — H2 MySQL 모드 호환 위해 (V40 노트 참조).

CREATE TABLE wehago_connection (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sm_user_emp_no VARCHAR(20) NOT NULL,
  wehago_id VARCHAR(100) NOT NULL,
  access_token VARCHAR(512) NOT NULL,
  cno BIGINT NOT NULL,
  company_no_biz VARCHAR(20),
  company_name VARCHAR(200),
  last_used_at DATETIME NULL,
  created_at DATETIME,
  updated_at DATETIME,
  created_id VARCHAR(20),
  updated_id VARCHAR(20),
  CONSTRAINT uk_wehago_connection_emp_no UNIQUE (sm_user_emp_no)
);

CREATE INDEX idx_wehago_connection_wehago_id ON wehago_connection (wehago_id);
