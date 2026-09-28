-- 외주발주 세부품목 테이블 (PoDtl(작업) → PoInfo(세부품목) 계층 도입)
-- 사유: 외주발주서가 작업1 단위 1행만 노출되어, 작업 안에 포함된 세부품목 N개를
--       발주서/모달에서 확인할 방법이 없었음. order_info 와 동일한 모양으로 PO 측 자식
--       테이블을 추가하여 OrderService.createPoFromOrder 시 OrderInfo 를 그대로 복제한다.
CREATE TABLE po_info (
    company_cd  INT          NOT NULL,
    plant_cd    INT          NOT NULL,
    po_no       VARCHAR(30)  NOT NULL,
    po_sq       INT          NOT NULL,
    info_sq     INT          NOT NULL,
    category    VARCHAR(30)  NULL COMMENT '구분',
    composition VARCHAR(200) NULL COMMENT '구성',
    item_name   VARCHAR(200) NULL COMMENT '세부품목명',
    note        VARCHAR(500) NULL,
    quantity    INT          DEFAULT 0,
    unit_price  BIGINT       DEFAULT 0,
    subtotal    BIGINT       DEFAULT 0,
    created_at  DATETIME     NULL,
    updated_at  DATETIME     NULL,
    created_id  VARCHAR(20)  NULL,
    updated_id  VARCHAR(20)  NULL,
    PRIMARY KEY (company_cd, plant_cd, po_no, po_sq, info_sq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
