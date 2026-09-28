-- P&D 외주발주서 제작사양 '구성품종수'(키인) 필드. P&D 작업은 코팅/후가공/제본/기타 대신 구성품종수를 쓴다.
ALTER TABLE po_mst ADD COLUMN kind_qty VARCHAR(100) NULL COMMENT 'P&D 구성품종수(키인)';
