package com.tara.crm.production.repository;

/**
 * 생산 화면 공통 판정 규칙 — 생산계획현황·생산계획 대시보드·주문 타임라인가 같은 ERP 계획 테이블을 보므로
 * 같은 기준을 써야 한다(사용자 지시 2026-10-08). 화면마다 SQL 을 따로 쓰지 말고 여기 조각을 붙인다.
 *
 * <ul>
 *   <li><b>완료</b> = 대수마감(PRPCNT_CLOSE_YN) Y, 또는 설비가 "외부입고(…)". 외부입고는 밖에서 들여오는 공정이라
 *       공장에서 대수마감을 거의 찍지 않는다(2026-10 첫 주 외부입고 1,228행 중 마감 11) — 사용자 확인 2026-10-08.</li>
 *   <li><b>접지/제본</b> = 같은 테이블 PP_PLANBBND 를 제품 여부(LAST_YN)·보충 여부(SUPP_YN)로 가른다(ERP 고정값).
 *       2026년 행은 "연결키(KEY_VAL_NM) 없음 = 제본" 과도 전부 일치했다(접지 44,808 / 제본 18,201).</li>
 *   <li><b>MES 실적</b>(PP_PROD_IF) 은 취소된 생산오더(PP_PROD_MST.CNCL_YN)를 뺀다(2026년 취소 오더 연동 7,075건).
 *       실적 연동 여부는 완료 판정과 별개의 참고 정보다 — 외부입고·외주는 실적이 거의 생기지 않는다.</li>
 * </ul>
 */
public final class ProductionRules {

    private ProductionRules() {}

    /** 외부입고 설비 이름 패턴(PM_EQ_SDTL.EQP_NM LIKE). */
    public static final String EXT_EQP_LIKE = "외부입고%";

    /** 완료 판정 SQL — plan = 계획 행 별칭, eqp = 설비(PM_EQ_SDTL) 별칭. 결과 'Y'/'N'. */
    public static String doneExpr(String plan, String eqp) {
        return "CASE WHEN NVL(" + plan + ".PRPCNT_CLOSE_YN, 'N') = 'Y' OR " + eqp + ".EQP_NM LIKE '" + EXT_EQP_LIKE + "' THEN 'Y' ELSE 'N' END";
    }

    /** 외부입고 설비 여부 SQL — 'Y'/'N'. */
    public static String extExpr(String eqp) {
        return "CASE WHEN " + eqp + ".EQP_NM LIKE '" + EXT_EQP_LIKE + "' THEN 'Y' ELSE 'N' END";
    }

    /** 제본(제품 또는 보충) 행 조건 — PP_PLANBBND 별칭. */
    public static String isBind(String bbnd) {
        return "(NVL(" + bbnd + ".LAST_YN, 'N') = 'Y' OR NVL(" + bbnd + ".SUPP_YN, 'N') = 'Y')";
    }

    /** 접지(제품 아님·보충 아님) 행 조건 — PP_PLANBBND 별칭. */
    public static String isFold(String bbnd) {
        return "(NVL(" + bbnd + ".LAST_YN, 'N') != 'Y' AND NVL(" + bbnd + ".SUPP_YN, 'N') != 'Y')";
    }

    /**
     * 외주 발주 — 계획 행(계획번호·순번·하위순번·작업장 그룹 TOP_ORGN_CD)에 붙은 발주의 업체·납기요청일(= 입고요청일)·발주번호.
     * 외주 공정은 설비명이 "외주(톰슨)" 같은 자리표시라, 화면은 설비명 대신 VENDOR_NM(발주 업체)을 보여준다(사용자 요청 2026-10-08).
     * 계획 행 하나에 발주 라인이 여럿이면 MAX 로 하나만(업체가 둘 이상인 경우는 2026-10 기준 확인 못 함).
     *
     * @param alias      조인 별칭 — VENDOR_NM / REQ_DT / PURDOC_NO 를 이 별칭으로 읽는다
     * @param plan       계획 행 별칭(PLAN_NO·PLAN_SQ·PLAN_LOW_SQ·TOP_ORGN_CD 를 가진 쪽)
     * @param planNoSql  발주를 미리 좁힐 계획번호 SELECT — 발주 상세엔 계획번호 색인뿐이라 넓게 읽지 않게
     */
    public static String vendorJoin(String alias, String plan, String planNoSql) {
        return " LEFT OUTER JOIN (SELECT VD.PLAN_NO, VD.PLAN_SQ, VD.PLAN_LOW_SQ, VD.TOP_ORGN_CD,"
                + " MAX(VC.PARTNER_NM) AS VENDOR_NM, MAX(VD.DEDT_REQN_DT) AS REQ_DT, MAX(VD.PURDOC_NO) AS PURDOC_NO"
                + " FROM PP_PURORDER_DTL_X20329 VD"
                + " INNER JOIN PP_PURORDER_MST_X20329 VM ON VM.COMPANY_CD = VD.COMPANY_CD AND VM.PLANT_CD = VD.PLANT_CD AND VM.PURDOC_NO = VD.PURDOC_NO"
                + " LEFT OUTER JOIN CI_PARTNER_MST VC ON VC.PARTNER_CD = VM.PARTNER_CD"
                + " WHERE VD.COMPANY_CD = '1000' AND VD.PLANT_CD = '1000' AND VD.PLAN_NO IN (" + planNoSql + ")"
                + " GROUP BY VD.PLAN_NO, VD.PLAN_SQ, VD.PLAN_LOW_SQ, VD.TOP_ORGN_CD) " + alias
                + " ON " + alias + ".PLAN_NO = " + plan + ".PLAN_NO AND " + alias + ".PLAN_SQ = " + plan + ".PLAN_SQ AND "
                + alias + ".PLAN_LOW_SQ = " + plan + ".PLAN_LOW_SQ AND " + alias + ".TOP_ORGN_CD = " + plan + ".TOP_ORGN_CD\n";
    }

    /** MES 실적 연동에서 취소된 생산오더를 빼는 조건 — PP_PROD_IF 별칭 뒤에 AND 로 붙인다. */
    public static String notCancelled(String prodIf) {
        return "NOT EXISTS (SELECT 1 FROM PP_PROD_MST PPM_X WHERE PPM_X.COMPANY_CD = " + prodIf + ".COMPANY_CD AND PPM_X.PROD_NO = "
                + prodIf + ".PROD_NO AND PPM_X.CNCL_YN = 'Y')";
    }
}
