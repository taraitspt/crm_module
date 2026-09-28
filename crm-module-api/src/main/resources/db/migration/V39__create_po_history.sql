-- 외주발주 변경 이력 테이블. PoService 의 update/confirm/ship/unship 등에서 행 자동 insert.
-- BaseEntity audit 의 단일 updatedAt/updatedBy 와 달리, 각 변경 시점마다 row 1개 누적 → 06 로그기록 섹션에 목록 표시.
CREATE TABLE po_history (
    history_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_cd      INT          NOT NULL,
    plant_cd        INT          NOT NULL,
    po_no           VARCHAR(30)  NOT NULL,
    action_cd       VARCHAR(20)  NOT NULL COMMENT 'CREATE/UPDATE/CONFIRM/SHIP/UNSHIP/CANCEL',
    changed_at      DATETIME     NOT NULL,
    changed_by      VARCHAR(20)  NULL COMMENT 'employee_no',
    changed_by_name VARCHAR(100) NULL,
    summary         VARCHAR(500) NULL COMMENT '변경 요약 (선택, 액션별 자유 텍스트)',
    INDEX idx_po_history_po (company_cd, plant_cd, po_no, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
