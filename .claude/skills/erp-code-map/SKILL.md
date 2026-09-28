---
name: erp-code-map
description: ERP 연동 코드 매핑을 다룰 때 — 작업처(wrkCd/poItemType) 코드↔라벨, 결제방식→세무구분, PO/정산/주문 상태 라이프사이클, goal_mst 부서 매핑. 발주·매출·정산·통계 로직 수정 시 사용.
---

# ERP 코드 매핑 & 상태 라이프사이클

⚠️ 코드값 실수 = 사고. 새 코드/매핑을 다루면 아래 규칙 + **권위 소스(코드)** 를 반드시 대조. 라벨을 추측하지 말 것.

## 작업처 (order_dtl.wrkCd / po.poItemType / 목록 workType)
- **권위 소스**: 프론트 `purchase/OutsourcingPoPage.tsx` 의 `WORK_PLACE_FALLBACK_LABELS`·`isPurchaseWorkType`; 백엔드 `ErpTransactionSyncService` 의 `PND_WORK_TYPE`·`ERP_AUTO_PO_WORK_TYPES`·`INTERNAL_PRODUCTION_WORK_CODES`.
- 확실한 코드: `S001`=P&D(수작업), `G0602`=POD외주, `G9999`=상품구매/구매. (`G0600`/`G0601` 등 나머지 라벨은 위 맵에서 확인)
- 자동 외주발주 대상: `ERP_AUTO_PO_WORK_TYPES = {G0600, G0601, G0602, G9999, S002}`. **P&D(S001)는 여기 빠지고 `ensureManualPoForPnd` 가 별도 생성.** 내부생산(G0100~G0500)·센터·디자인은 발주 없음.
- ★ **workType 비교를 코드 단독으로 하지 말 것** — 한글 라벨로도 들어옴. `=== 'G0601' || === 'PACKAGE' || includes('패키지')` 식으로 PoFormBody 를 미러링(패키지 판별 등이 코드만 비교하면 샌다).

## 결제방식(payType) → 세무구분/전표
- 권위 소스: `SalesService.buildSalesVoucher`.
- payType: `TAX_INVOICE`(전자세금계산서)/`CARD`(카드)/`TRANSFER`(계좌이체)/`UNTACT_PAY`(비대면결제)/`INTERNAL`(사내실적)/`PRE_SALES_DEDUCT`(선매출차감).
- 세무구분: 전자세금계산서=과세/영세/면세, 카드=17, 계좌이체=건별14(기본)·현금과세31·수출16, 선매출차감=null. 비대면=차변 12002 + 토스거래처 05378, 비대면취소=BIL2U.

## PO(외주발주) 상태 — po_mst.statusCd
`DRAFT`(임시저장) → `PENDING`(발주대기) → `UNSETTLED`/`SALES_CONFIRMED`(발주확정) → `SHIPPED`(발송완료) → `SETTLED`/`PURCHASE_DONE`.
- 발주목록(수작업/외주/구매)은 `statusCd != 'DRAFT'` 만 노출.
- 구매(G9999)는 발주확정 없이 바로 발송완료 가능(특례). 구매발주목록엔 발주확정 버튼 숨김.
- 발송취소: 상품구매=`cancelShippedToPending`(→PENDING), 외주=`cancelShipped`(→SALES_CONFIRMED).

## 정산(po_settle) 상태 — statusCd
`DRAFT`(정산대기) → `SETTLED`(정산확정) → `GITGO_SENT`(결재대기) → `GITGO_APPROVED`(승인완료=실제지급) → `VOUCHER_PENDING`/`VOUCHER_SENT`.
- 외주정산현황 집계 = 승인완료(GITGO_APPROVED) 이상만.
- 정산목록(외주/구매정산등록)은 **발송완료(SHIPPED) 이상 발주만** 노출 (`PoSettleDtlQueryRepository.buildWhere` 가 DRAFT/PENDING/UNSETTLED/SALES_CONFIRMED PO 제외).

## 주문 상태 — order_dtl.statusCd (★순번단위로만)
`PENDING`(주문접수)/`CONFIRMED`(주문확정)/`OUTSOURCE_PO`(발주완료)/`SHIPPED`/`SALES_REGISTERED`/`PROGRESS_ERROR`(진행오류)/`CANCELLED`.
- **`order_mst.status_cd` 절대 사용/변경 금지** — 상태는 order_dtl(주문번호-순번) 단위로만.
- 순번 확정취소(→PENDING)는 발주가 발주대기/DRAFT 일 때만 허용, 발주확정↑이면 차단. 미확정 PO는 삭제 말고 DRAFT 로 보존(발주서 유실 방지, 재확정 시 복원).

## goal_mst (목표) 부서 매핑 — 통계
- 조회: `sales_emp_id = 'DEPT_<부서코드>'` + `field_cd='AM'` + `plan_yy`/`plan_mm`. 조인 `d.dept_cd = CAST(SUBSTRING(g.sales_emp_id,6) AS UNSIGNED)`.
- 통합/AM실적은 조회기간의 월만 봄(월단위). "목표 안 뜸"이면 그 부서·그 달에 goal_mst 행 있는지부터 확인.
- 부서 계층: `departments.up_dept_cd` 자기참조(사업본부→팀→파트). up_dept_cd 없는 부서(TFT 등)는 계층 밖이라 주의.
