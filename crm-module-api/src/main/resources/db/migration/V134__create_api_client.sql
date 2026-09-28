-- 외부 제공 API 클라이언트 (2026-09-17) — 사내 타 팀/시스템이 GROW 매출 데이터를 가져다 쓰는
-- 외부 API(/api/ext/**)의 소비자 관리. 인증은 기존 사용자 JWT 재사용(서비스 계정 = users 행)이고,
-- 권한(스코프)·데이터 범위(부서·사업장)·호출 한도·토큰 폐기(token_version)는 이 테이블이 결정한다.
-- 토큰에 apiClientId + tokenVer 클레임이 실리고, 재발급하면 token_version 이 올라 옛 토큰은 즉시 401.
CREATE TABLE IF NOT EXISTS api_client (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd       INT          NOT NULL,
    client_name      VARCHAR(100) NOT NULL COMMENT '클라이언트(팀·시스템) 이름',
    user_id          VARCHAR(20)  NOT NULL COMMENT '연결된 서비스 계정 users.id (토큰 subject)',
    scopes           VARCHAR(200) NOT NULL COMMENT '허용 스코프 콤마목록: SALES_READ,SALES_SUMMARY',
    dept_cds         VARCHAR(500) NULL     COMMENT '조회 허용 부서코드 콤마목록. NULL=전체',
    plant_cd         INT          NOT NULL DEFAULT 2000 COMMENT '사업장(GRP 2000 / PM 3000)',
    rate_per_min     INT          NOT NULL DEFAULT 60 COMMENT '분당 호출 한도',
    daily_limit      INT          NOT NULL DEFAULT 5000 COMMENT '일 호출 한도',
    status           VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / SUSPENDED',
    token_version    INT          NOT NULL DEFAULT 0 COMMENT '토큰 버전 — 발급 때마다 +1, 토큰 클레임과 불일치면 401',
    token_issued_at  DATETIME     NULL     COMMENT '마지막 토큰 발급 시각',
    token_expires_at DATETIME     NULL     COMMENT '마지막 발급 토큰 만료 시각',
    expires_at       DATETIME     NULL     COMMENT '클라이언트 자체 만료(지나면 401). NULL=무기한',
    owner_name       VARCHAR(50)  NULL     COMMENT '소비자측 담당자',
    memo             VARCHAR(500) NULL,
    created_at       DATETIME     NULL,
    updated_at       DATETIME     NULL,
    created_id       VARCHAR(20)  NULL,
    updated_id       VARCHAR(20)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_api_client_user (company_cd, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 외부 API 호출 로그 — 클라이언트별 호출 내역·일별 건수(관리 화면). 한도 판정은 in-memory 라 이 표는 기록용.
CREATE TABLE IF NOT EXISTS api_call_log (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    client_id   BIGINT       NOT NULL,
    user_id     VARCHAR(20)  NULL,
    method      VARCHAR(10)  NOT NULL,
    path        VARCHAR(200) NOT NULL,
    status_code INT          NOT NULL,
    elapsed_ms  INT          NULL,
    remote_ip   VARCHAR(45)  NULL,
    called_at   DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_api_call_log_client_dt (client_id, called_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
