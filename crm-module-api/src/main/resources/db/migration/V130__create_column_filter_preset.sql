-- 컬럼 필터 저장조건 (2026-09-02 현업 요청) — 목록 화면 th 필터 팝업에서 조건을 저장해 두고
-- 체크박스로 선택/해제해 쓰기 위한 테이블. ERP 와 같은 모양: 조건 하나 = 값 하나 = 1행. 사용자 본인 것만 보인다.
-- 중복(같은 사람·화면·컬럼·조건·값)은 유니크 키 대신 저장 코드에서 걸러낸다(ColumnFilterPresetService.save).
-- 브라우저 저장(localStorage)이 아니라 DB 에 두는 이유: PC/브라우저를 바꿔도 유지, 캐시 삭제로 유실 안 됨.
-- 로컬 검증은 flyway 가 꺼져 있어 이 SQL 을 직접 실행해 두고 테스트한다 → 배포 시 중복 생성 실패 방지용 IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS column_filter_preset (
    preset_id    BIGINT       NOT NULL AUTO_INCREMENT,
    company_cd   INT          NOT NULL,
    employee_no  VARCHAR(20)  NOT NULL COMMENT '소유자 사번(없으면 로그인 id)',
    page_path    VARCHAR(100) NOT NULL COMMENT '화면 라우트 경로 (예: /orders)',
    column_id    VARCHAR(50)  NOT NULL COMMENT '컬럼(th) id (예: title)',
    filter_op    VARCHAR(20)  NOT NULL COMMENT '조건: CONTAINS/EQUALS/NOT_CONTAINS/GTE/LTE/IN',
    filter_value VARCHAR(200) NOT NULL COMMENT '값 하나',
    created_at   DATETIME     NULL,
    updated_at   DATETIME     NULL,
    created_id   VARCHAR(20)  NULL,
    updated_id   VARCHAR(20)  NULL,
    PRIMARY KEY (preset_id),
    KEY idx_column_filter_preset_owner (company_cd, employee_no, page_path, column_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
