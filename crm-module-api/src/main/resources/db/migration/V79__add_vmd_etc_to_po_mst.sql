-- VMD 외주발주서 '기타'(키인) 필드. VMD 작업은 코팅/후가공/제본 대신 기타를 사용한다.
ALTER TABLE po_mst ADD COLUMN vmd_etc VARCHAR(500) NULL COMMENT 'VMD 외주발주 기타(키인)';
