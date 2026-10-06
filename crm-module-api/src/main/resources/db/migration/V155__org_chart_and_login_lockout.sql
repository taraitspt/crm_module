-- 조직도(부서 관리) · 로그인 잠금 — HRM(인사평가) 에서 이식 (2026-10-06)
--
-- 1) 로그인 잠금: 비밀번호를 연속으로 틀리면 계정을 일정 시간 잠근다. 기준(횟수·시간)은 application.yml auth.lockout.*,
--    여기는 상태만 둔다. 비밀번호를 바꾸거나(직접 변경·임시 비밀번호 발급) 관리자가 사용자 관리에서 풀면 해제된다.
--    auth_history.event_type 은 VARCHAR 라 LOGIN_FAILED / LOCKED / UNLOCKED 를 그대로 받는다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0 COMMENT '연속 로그인 실패 횟수 — 성공 시 0';
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until DATETIME NULL COMMENT '이 시각까지 로그인 차단. NULL 이면 잠기지 않음';

-- 2) 부서 관리: 부서장 · 사용 여부 · 같은 상위 부서 안 표시 순서. 셋 다 관리자 › 부서 관리에서 정하고 ERP 동기화는 건드리지 않는다.
--    관리자가 직접 추가한 부서(ERP 에 없는 묶음, erp_dept_code 가 비어 있음)는 90001 부터 번호를 받는다.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS head_employee_no VARCHAR(20) NULL COMMENT '부서장 사번 (본부장·팀장 등 — 관리자 지정, ERP 동기화가 건드리지 않음)';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS use_yn CHAR(1) NOT NULL DEFAULT 'Y' COMMENT '사용 여부 (Y 사용 / N 미사용 — 부서 관리 트리·부서 선택에서 숨김)';
ALTER TABLE departments ADD COLUMN IF NOT EXISTS sort_order INT NULL COMMENT '같은 상위 부서 안 표시 순서 (작을수록 위, 비면 부서 코드 순)';

-- 3) 관리자 › 부서 관리 메뉴 — ADMIN 만. 다른 역할은 권한 관리 화면에서 켤 수 있다(API 는 ADMIN 전용).
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/admin/departments', r.role, CASE WHEN r.role = 'ADMIN' THEN 1 ELSE 0 END, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r
 WHERE NOT EXISTS (SELECT 1 FROM menu_permission p WHERE p.menu_key = '/admin/departments' AND p.role = r.role);
