-- master 브랜치 병합 보강: VoucherDtl 엔티티에 abdocu_no / rdoline_sq 필드가 추가됐으나
-- 대응 마이그레이션이 누락되어 프로덕션에서 'Unknown column vd1_0.abdocu_no' (500) 오류 발생.
-- 더존 매입전표 역발행(원문서번호/라인순번) 연동용 컬럼을 보강한다.
-- MariaDB IF NOT EXISTS 사용 — 운영에서 수동으로 먼저 추가했더라도 중복오류 없이 통과.
ALTER TABLE voucher_dtl ADD COLUMN IF NOT EXISTS abdocu_no VARCHAR(40) NULL COMMENT '더존 역발행 원문서번호(AB_DOCU_NO)';
ALTER TABLE voucher_dtl ADD COLUMN IF NOT EXISTS rdoline_sq INT NULL COMMENT '더존 역발행 라인 순번(RDO_LINE_SQ)';
