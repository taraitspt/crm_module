-- 주문 변경 이력 테이블. OrderService 의 create/update/delete 에서 행 1개씩 자동 insert.
-- BaseEntity audit 의 단일 updatedAt/updatedBy 와 달리 각 변경 시점마다 row 누적.
-- 특히 주문 삭제는 하드딜리트(order_mst row 소멸)라, 삭제 시점 스냅샷(거래처/금액/건수)을 summary 에 남긴다.
-- po_history(V39) 와 동일 패턴. order_mst 로의 FK 는 두지 않는다(삭제 후에도 이력 보존).
CREATE TABLE order_history (
    history_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_cd      INT          NOT NULL,
    plant_cd        INT          NOT NULL,
    order_no        VARCHAR(30)  NOT NULL,
    action_cd       VARCHAR(20)  NOT NULL COMMENT 'CREATE/UPDATE/DELETE',
    changed_at      DATETIME     NOT NULL,
    changed_by      VARCHAR(20)  NULL COMMENT 'employee_no / user_id',
    changed_by_name VARCHAR(100) NULL,
    summary         VARCHAR(500) NULL COMMENT '변경 요약 (액션별 자유 텍스트, 삭제는 스냅샷)',
    INDEX idx_order_history_order (company_cd, plant_cd, order_no, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
