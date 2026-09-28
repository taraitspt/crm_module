-- voucher_mst.title 이 VARCHAR(100) 이라, 원천(order_title/sales_title 은 VARCHAR(200), 취소/반품은 '[취소] '·'[반품] '
-- 접두어까지 붙어 더 길어짐)을 그대로 넣으면 100자 초과 시 SQL 1406(Data too long for column 'title')로 전표 생성이 실패했다.
-- 원천 길이(200) + 접두어 여유를 포함해 255 로 확장(서비스단 clampTitle 로도 255 방어절단). title 은 인덱스 없음.
ALTER TABLE voucher_mst MODIFY COLUMN title VARCHAR(255) NULL COMMENT '제목';
