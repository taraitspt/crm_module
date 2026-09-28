-- 주문 배송정보(ERP SD_ORDDLV_MST + PP_DLVPOD_MST)를 order_dlv(배송순번 단위)에 담기 위한 컬럼 추가.
-- ERP 동기화 주문은 그동안 order_dlv 가 비어 있었고(수기주문만 채워짐), 배송정보가 외주발주(PoMst)로만 매핑되던 걸 바로잡는다.
-- ★기존 컬럼 재사용: dlv_addr = 기본주소(BASE_ADDR), note = 배송요청사항(ETC_DC4). → base_addr/deliv_note 신설 안 함.
--   상세주소(DTL_ADDR)만 대응 컬럼이 없어 dtl_addr 추가.
-- 운송장번호(deliv_no)는 발송 후 PP_DLVPOD 에 생기므로 전용 배치가 백필. 주문목록 표시/검색용.
-- ★H2(local 프로필)는 콤마결합 ADD COLUMN 파싱 못 하므로 컬럼마다 ALTER TABLE 분리.
ALTER TABLE order_dlv ADD COLUMN deliv_mthd_cd VARCHAR(10) NULL COMMENT '배송방법 (ERP DELIV_MTHD_CD, 공통코드 DELIVERY_METHOD)';
ALTER TABLE order_dlv ADD COLUMN deliv_no VARCHAR(50) NULL COMMENT '운송장번호 (ERP PP_DLVPOD_MST.DELIV_NO, 발송 후 sync 백필)';
ALTER TABLE order_dlv ADD COLUMN recipient_name VARCHAR(50) NULL COMMENT '받는사람 (ERP RCVN_PSN_NM)';
ALTER TABLE order_dlv ADD COLUMN recipient_phone VARCHAR(30) NULL COMMENT '연락처 (ERP HP_NO)';
ALTER TABLE order_dlv ADD COLUMN post_no VARCHAR(20) NULL COMMENT '우편번호 (ERP POST_NO)';
ALTER TABLE order_dlv ADD COLUMN dtl_addr VARCHAR(200) NULL COMMENT '상세주소 (ERP DTL_ADDR) — 기본주소는 기존 dlv_addr 재사용';
