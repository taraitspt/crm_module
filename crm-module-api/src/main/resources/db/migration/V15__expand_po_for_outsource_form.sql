-- 외주발주서 헤더(규격/수량/입고요청일/작업주의사항) + 배송정보 (시트 #7 외주발주서 예시 1~6, 9~11)
-- 배송정보는 1 PO = 1 납품지(수령처) 가정 (간단화).
ALTER TABLE po_mst
    ADD COLUMN spec               VARCHAR(200) NULL COMMENT '규격(헤더 key-in)' AFTER work_title,
    ADD COLUMN qty_header         INT          NULL COMMENT '수량(헤더 key-in, 작업/품목수량과 별개)' AFTER spec,
    ADD COLUMN request_arrival_dt DATE         NULL COMMENT '입고요청일' AFTER delivery_dt,
    ADD COLUMN work_note          VARCHAR(500) NULL COMMENT '작업주의사항' AFTER request_arrival_dt,
    ADD COLUMN delivery_method    VARCHAR(20)  NULL COMMENT '배송방법(택배/방문/직배 등)' AFTER work_note,
    ADD COLUMN recipient_name     VARCHAR(50)  NULL COMMENT '받는사람'        AFTER delivery_method,
    ADD COLUMN recipient_phone    VARCHAR(30)  NULL COMMENT '연락처(휴대폰)'   AFTER recipient_name,
    ADD COLUMN delivery_zip       VARCHAR(10)  NULL COMMENT '우편번호'        AFTER recipient_phone,
    ADD COLUMN delivery_addr1     VARCHAR(200) NULL COMMENT '기본주소'        AFTER delivery_zip,
    ADD COLUMN delivery_addr2     VARCHAR(200) NULL COMMENT '상세주소'        AFTER delivery_addr1;
