-- VMD 작업사양(사이즈/실사합지유무/평판UV인쇄유무/도장)을 주문(order_info)에도 저장.
-- 기존엔 발주(po_info)에만 있어 주문에 입력해도 저장이 안 되고 외주발주로 안 넘어가던 문제 해결.
ALTER TABLE order_info ADD COLUMN IF NOT EXISTS vmd_size VARCHAR(100) NULL COMMENT 'VMD 작업사양 사이즈';
ALTER TABLE order_info ADD COLUMN IF NOT EXISTS vmd_laminate VARCHAR(50) NULL COMMENT 'VMD 실사합지 유무';
ALTER TABLE order_info ADD COLUMN IF NOT EXISTS vmd_uv_print VARCHAR(50) NULL COMMENT 'VMD 평판 UV인쇄 유무';
ALTER TABLE order_info ADD COLUMN IF NOT EXISTS vmd_stamp VARCHAR(100) NULL COMMENT 'VMD 도장';
