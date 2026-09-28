-- VMD 외주발주서 작업사양(아이템) 신규 키인 컬럼. VMD 작업: 소재(=기존 process 재사용) + 아래 4개.
ALTER TABLE po_info ADD COLUMN vmd_size VARCHAR(100) NULL COMMENT 'VMD 사이즈(키인)';
ALTER TABLE po_info ADD COLUMN vmd_laminate VARCHAR(50) NULL COMMENT 'VMD 실사합지 유무(키인)';
ALTER TABLE po_info ADD COLUMN vmd_uv_print VARCHAR(50) NULL COMMENT 'VMD 평판 UV인쇄 유무(키인)';
ALTER TABLE po_info ADD COLUMN vmd_stamp VARCHAR(100) NULL COMMENT 'VMD 도장(키인)';
