-- 데이터 범위 (2026-09-21) — 역할이 각 데이터 종류를 어디까지 보는가.
--
-- 메뉴가 아니라 '리소스(데이터 종류)'를 축으로 잡았다.
-- 같은 API 를 여러 화면이 공유하기 때문에(영업활동 조회 = 캘린더·보드·이력·거래처카드),
-- 메뉴 단위로 범위를 정하면 서버가 호출 화면을 클라이언트 말에 의존해 판단해야 해서 위험하다.
-- 리소스 단위면 서버가 스스로 판단할 수 있고, "활동은 본인 것만 / 매출현황은 전체" 같은 차등도 그대로 표현된다.
CREATE TABLE resource_scope (
    resource   VARCHAR(30) NOT NULL COMMENT 'ACTIVITY / DEAL / SALES_PLAN / SALES_STATS',
    role       VARCHAR(20) NOT NULL COMMENT 'users.role',
    scope      VARCHAR(10) NOT NULL COMMENT 'NONE / SELF / DEPT / ALL',
    created_at DATETIME    NULL,
    updated_at DATETIME    NULL,
    created_id VARCHAR(20) NULL,
    updated_id VARCHAR(20) NULL,
    PRIMARY KEY (resource, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='역할별 데이터 범위';

-- 기본값: 활동·기회·계획은 개인 소유물이라 역할에 따라 자르고,
--         매출현황(ERP 집계)은 회사 실적이라 전원 전체로 연다.
INSERT INTO resource_scope (resource, role, scope, created_at, created_id)
SELECT r.resource, x.role,
       CASE
         WHEN r.resource = 'SALES_STATS' THEN 'ALL'
         WHEN x.role IN ('ADMIN','SALES_SPT','EXECUTIVE','CENTER_LEADER','FINANCE') THEN 'ALL'
         WHEN x.role IN ('TEAM_LEADER','PART_LEADER') THEN 'DEPT'
         ELSE 'SELF'
       END,
       NOW(), 'system'
  FROM (SELECT 'ACTIVITY' AS resource
        UNION ALL SELECT 'DEAL'
        UNION ALL SELECT 'SALES_PLAN'
        UNION ALL SELECT 'SALES_STATS') r
 CROSS JOIN (SELECT 'ADMIN' AS role
             UNION ALL SELECT 'TEAM_LEADER'
             UNION ALL SELECT 'MANAGER'
             UNION ALL SELECT 'SALES_SPT'
             UNION ALL SELECT 'PART_LEADER'
             UNION ALL SELECT 'EXECUTIVE'
             UNION ALL SELECT 'CENTER_LEADER'
             UNION ALL SELECT 'FINANCE'
             UNION ALL SELECT 'STAFF') x;
