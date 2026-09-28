-- P&D 외주발주서 '부자재 사용내역' 섹션 — po_paper_purchase 테이블 재활용(V65 이후 용지발주는 po_info 로 이관되어 휴면).
-- 부자재: 종류(mat_type) / 내용(mat_content) / 수량(quantity, 기존 컬럼 재사용) / 비용(cost).
-- 정산 항목이 아니므로 po_info(정산 연동) 가 아닌 별도 테이블에 보관한다.
ALTER TABLE po_paper_purchase ADD COLUMN mat_type    VARCHAR(100) NULL COMMENT '부자재 종류(키인)';
ALTER TABLE po_paper_purchase ADD COLUMN mat_content VARCHAR(300) NULL COMMENT '부자재 내용(키인)';
ALTER TABLE po_paper_purchase ADD COLUMN cost        BIGINT       NULL COMMENT '부자재 비용';
