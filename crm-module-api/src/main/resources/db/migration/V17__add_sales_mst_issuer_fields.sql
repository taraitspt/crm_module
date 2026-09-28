-- 세금계산서 발행 모달 image4 의 발행 대상자(상대) 정보 + 발행 부가 정보 (시트 #14)
ALTER TABLE sales_mst
    ADD COLUMN issuer_biz_no       VARCHAR(20)  NULL COMMENT '사업자번호',
    ADD COLUMN issuer_company      VARCHAR(100) NULL COMMENT '상호',
    ADD COLUMN issuer_ceo          VARCHAR(50)  NULL COMMENT '성명',
    ADD COLUMN issuer_zipcode      VARCHAR(10)  NULL COMMENT '우편번호',
    ADD COLUMN issuer_addr1        VARCHAR(200) NULL COMMENT '기본주소',
    ADD COLUMN issuer_addr2        VARCHAR(200) NULL COMMENT '상세주소',
    ADD COLUMN issuer_industry     VARCHAR(50)  NULL COMMENT '업태',
    ADD COLUMN issuer_item         VARCHAR(50)  NULL COMMENT '종목',
    ADD COLUMN issuer_sub_no       VARCHAR(20)  NULL COMMENT '종사업장번호',
    ADD COLUMN issuer_dept         VARCHAR(100) NULL COMMENT '부서명',
    ADD COLUMN issuer_contact_name VARCHAR(50)  NULL COMMENT '담당자',
    ADD COLUMN issuer_email        VARCHAR(100) NULL COMMENT 'E-mail',
    ADD COLUMN issuer_phone        VARCHAR(30)  NULL COMMENT '연락처',
    ADD COLUMN issuer_mobile       VARCHAR(30)  NULL COMMENT '휴대폰',
    ADD COLUMN issue_dt            DATE         NULL COMMENT '작성일자',
    ADD COLUMN issue_type          VARCHAR(20)  NULL COMMENT '영수/청구',
    ADD COLUMN issue_target        VARCHAR(20)  NULL COMMENT '기업/개인';
