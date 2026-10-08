-- V163: 생산본부(dept 1300) 아래 모든 부서의 재직·미사용 계정을 생산지원(PROD_SPT)으로 일괄 변경 (2026-10-08 사용자 결정).
-- 팀장·파트장(V162 에서 지정한 생산본부 8명 포함)도 생산지원 — 직책(job_title)은 그대로 둔다.
-- 2026-10-08 로컬 기준 13개 부서·재직 111명(생산기획팀·물류파트·생산운영팀·설비기술파트·스티커제작·인쇄파트 매엽/윤전·제본파트 무선/중철·제판파트·외주협력팀·품질개선팀).
-- 이후 ERP 동기화로 생기는 새 계정도 생산본부 아래면 생산지원으로 만든다(ErpMasterSyncService.roleForNewUser).
-- 관리자(ADMIN)는 건드리지 않는다.
UPDATE users
   SET role = 'PROD_SPT', updated_at = NOW(), updated_id = 'system'
 WHERE role <> 'ADMIN'
   AND company_cd = 1000
   AND dept_cd IN (
        WITH RECURSIVE t AS (
            SELECT dept_cd FROM departments WHERE company_cd = 1000 AND dept_cd = 1300
            UNION ALL
            SELECT d.dept_cd FROM departments d JOIN t ON d.up_dept_cd = t.dept_cd WHERE d.company_cd = 1000
        )
        SELECT dept_cd FROM t
   );
