-- users 테이블에 비용센터명(cc_nm) 컬럼 추가. cc_cd(비용센터코드)와 짝.
ALTER TABLE users ADD COLUMN cc_nm VARCHAR(20) NULL COMMENT '비용센터명';
