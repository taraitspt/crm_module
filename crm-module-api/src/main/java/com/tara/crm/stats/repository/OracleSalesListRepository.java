package com.tara.crm.stats.repository;

import com.tara.crm.stats.dto.SalesListDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 매출리스트 — GROW 월매출리스트 쿼리를 옮긴 것(사용자 제공 2026-10-01). 조회 전용.
 *
 * <p>한 줄 = 매출번호 × 수주순번 × 주문(TOR) 단위. ERP 매출(SD_BILL)에 수주(SD_SO_DTL.PURDOC_NO)로 주문을 잇고,
 * 주문 정산(SD_ORDSTL_INFO_X20329)에서 공임(TOP_ORGN_CD≠'99')·용지('99')를 가져온다.
 * 부서는 영업담당자의 매출일 기준 발령부서(HR_HUAN) — 없으면 최초 발령의 이전부서 → 사원 마스터 부서 순.
 *
 * <p>정본과 다른 점:
 * <ul>
 *   <li>기간 조건을 바깥 HAVING 대신 안쪽 매출 조회(SBM.BILL_DT)에 둔다 — 결과는 같고 범위 밖 행을 조인하지 않는다.</li>
 *   <li>사업부문(PLANT_CD)을 선택값으로 바인딩하고 결과 컬럼에도 넣었다(ALL 조회 때 구분용).</li>
 * </ul>
 * 조건은 정본 그대로: 매출상태 'P', 매출취소 제외, 품목 TPSCOPYRIGHT001(저작권) 제외. 그래서 기간 합계는
 * 매출현황(SD_BILL 전체 합산)보다 저작권 매출만큼 작다 — 같은 값을 기대하지 말 것.
 * 주문 정산 금액은 주문 전체 금액이라 한 주문을 여러 번 나눠 매출한 경우 줄마다 반복된다(합산 금지, 줄 단위 참고용).
 */
@Repository
@RequiredArgsConstructor
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleSalesListRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    private static final String SQL_HEAD = """
            WITH DTL_TABLE AS (
                SELECT
                      SBD.COMPANY_CD
                    , SBD.PLANT_CD
                    , TO_CHAR(SBD.BILL_DT, 'YYYYMMDD') AS BILL_DT
                    , SBD.BILL_QT
                    /* 매출일 기준 발령부서 */
                    , COALESCE(H02.TARGET_DEPT_CD, H02_FIRST.FIRST_DEPT_CD, HEM.DEPT_CD) AS DEPT_CD
                    , MDM.DEPT_NM
                    , SBD.SALEGRP_CD
                    , MC8.SYSDEF_NM AS SALEGRP_NM
                    , SBD.BIZRSPT_EMPNO_CD
                    , HEM.KOR_NM AS BIZRSPT_EMPNO_NM
                    , SBD.BILLDOC_NO
                    , SBD.SODOC_NO
                    , SBD.ITEM_CD
                    , CI.ITEM_NM
                    , SODX.SPCFCS_ITEM_NM
                    , SBD.SODOC_SQ
                    , SODX.ORDDOC_NO
                    , SODX.ORDDOC_SQ
                    , RFI.ORDDOC_NO AS ORDDOC_NO3
                    , RFI.ORDDOC_SQ AS ORDDOC_SQ3
                    , SODX.PRPL_CD
                    , MC2.SYSDEF_NM AS PRPL_NM
                    , CASE
                          WHEN SBD.ITEM_CD = 'GRPSERVICE001' THEN '내부'
                          WHEN MC2.REL_FLAG_1_CD = 'I' THEN '내부'
                          WHEN MC2.REL_FLAG_1_CD = 'O' THEN '외부'
                          ELSE '외부'
                      END AS IO
                    , MC3.SYSDEF_CD AS ITEM_ACGRP_CD
                    , NVL(TMP.STL_PRRG_AMT, 0) AS NORMAL_LABOR_COST
                    , NVL(TMP2.STL_PRRG_AMT, 0) AS NORMAL_PAPER_COST
                    , CASE
                          WHEN SOMX.WRK_FG = '500' AND RFI.DTMN_YN = 'Y' THEN RFI.PRCH_AMT
                          WHEN SOMX.WRK_FG = '500' AND RFI.DTMN_YN != 'Y' THEN NVL(TMP.STL_PRRG_AMT + TMP2.STL_PRRG_AMT, 0)
                      END AS PRCH_AMT
                    , NVL(SBD.BOOK_AMT, 0) AS BOOK_AMT
                    , HEM2.KOR_NM
                    , SBD.SO_TP
                    , SBD.SO_TP_NM
                    , SBD.BILLPRTN_CD
                    , SBD.BILLPRTN_NM
                    , MC.SYSDEF_NM AS WRK_FG
                    , MC5.SYSDEF_NM AS SYSDEF_NM5
                    , SBD.CC_CD
                    , MCM.CC_NM
                FROM (
                    SELECT
                          SBD.COMPANY_CD
                        , SBD.PLANT_CD
                        , SSD.PURDOC_NO
                        , SSD.PURDOC_SQ
                        , TO_DATE(SBM.BILL_DT, 'YYYYMMDD') AS BILL_DT
                        , SBD.BILLDOC_NO
                        , SBD.BILL_SQ
                        , SBM.BILLPRTN_CD
                        , SBD.ITEM_CD
                        , SBD.BILL_QT
                        , SBD.BOOK_AMT
                        , SBD.SALEGRP_CD
                        , SBD.SODOC_NO
                        , SBD.SODOC_SQ
                        , SBD.CC_CD
                        , SSM.BIZRSPT_EMPNO_CD
                        , SSM.SO_TP
                        , SSDM.SO_TP_NM
                        , CPM.PARTNER_NM AS BILLPRTN_NM
                    FROM SD_BILL_MST SBM
                    INNER JOIN SD_BILL_DTL SBD
                       ON SBD.COMPANY_CD = SBM.COMPANY_CD
                      AND SBD.BILLDOC_NO = SBM.BILLDOC_NO
                      AND SBD.BILL_ST = 'P'
                    LEFT OUTER JOIN SD_SO_MST SSM
                       ON SSM.COMPANY_CD = SBD.COMPANY_CD
                      AND SSM.SODOC_NO   = SBD.SODOC_NO
                    LEFT OUTER JOIN SD_SO_DTL SSD
                       ON SSD.COMPANY_CD = SBD.COMPANY_CD
                      AND SSD.SODOC_NO   = SBD.SODOC_NO
                      AND SSD.SODOC_SQ   = SBD.SODOC_SQ
                      AND SSD.ITEM_ST    = 'C'
                    LEFT OUTER JOIN CI_PARTNER_MST CPM
                       ON CPM.PARTNER_CD = SBM.BILLPRTN_CD
                    LEFT OUTER JOIN SD_SODTYPE_MST SSDM
                       ON SSDM.COMPANY_CD = SBM.COMPANY_CD
                      AND SSDM.SO_TP      = SSM.SO_TP
                    WHERE SBM.COMPANY_CD = '1000'
                      AND SBM.BILL_DT BETWEEN ? AND ?
                      AND COALESCE(SBD.BILL_CNCL_YN, 'N') = 'N'
                      AND SBD.ITEM_CD NOT IN ('TPSCOPYRIGHT001')
            """;

    private static final String SQL_TAIL = """
                ) SBD
                LEFT OUTER JOIN SD_ORDER_DTL_X20329 SODX
                  ON SODX.COMPANY_CD = SBD.COMPANY_CD
                 AND SODX.ORDDOC_NO  = SBD.PURDOC_NO
                 AND SODX.ORDDOC_SQ  = SBD.PURDOC_SQ
                 AND SODX.PLANT_CD   = SBD.PLANT_CD
                LEFT OUTER JOIN HR_EMP_MST HEM2
                  ON HEM2.COMPANY_CD = SBD.COMPANY_CD
                 AND HEM2.EMP_NO     = SODX.ASGNR_EMP_NO
                LEFT OUTER JOIN SD_MAKERQST_DTL_X20329 MRD
                  ON MRD.COMPANY_CD = SODX.COMPANY_CD
                 AND MRD.ORDDOC_NO  = SODX.RQST_NO
                 AND MRD.ORDDOC_SQ  = SODX.RQST_SQ
                LEFT OUTER JOIN SD_RFQ_INFO_X20329 RFI
                  ON RFI.COMPANY_CD = MRD.COMPANY_CD
                 AND RFI.ORDDOC_NO  = MRD.ORDDOC_NO
                 AND RFI.ORDDOC_SQ  = MRD.ORDDOC_SQ
                 AND RFI.DTMN_YN    = 'Y'
                LEFT OUTER JOIN MA_CODEDTL MC5
                  ON SODX.BBND_INFO_CD = MC5.SYSDEF_CD
                 AND MC5.COMPANY_CD    = '1000'
                 AND MC5.MODULE_CD     = 'SD'
                 AND MC5.FIELD_CD      = 'Z010_20329'
                LEFT OUTER JOIN SD_ORDER_MST_X20329 SOMX
                  ON SOMX.COMPANY_CD = SBD.COMPANY_CD
                 AND SOMX.ORDDOC_NO  = SBD.PURDOC_NO
                 AND SOMX.PLANT_CD   = SBD.PLANT_CD
                LEFT OUTER JOIN MA_CODEDTL MC
                  ON SOMX.WRK_FG    = MC.SYSDEF_CD
                 AND MC.COMPANY_CD  = '1000'
                 AND MC.MODULE_CD   = 'SD'
                 AND MC.FIELD_CD    = 'Z024_20329'
                LEFT OUTER JOIN CI_ITEM CI
                  ON CI.ITEM_CD = SBD.ITEM_CD
                LEFT OUTER JOIN (
                    SELECT A.COMPANY_CD, A.ORDDOC_NO, A.ORDDOC_SQ, A.PLANT_CD, SUM(A.STL_PRRG_AMT) AS STL_PRRG_AMT
                    FROM SD_ORDSTL_INFO_X20329 A
                    WHERE A.TOP_ORGN_CD != '99'
                    GROUP BY A.COMPANY_CD, A.ORDDOC_NO, A.ORDDOC_SQ, A.PLANT_CD
                ) TMP
                  ON TMP.COMPANY_CD = SODX.COMPANY_CD
                 AND TMP.ORDDOC_NO  = SODX.ORDDOC_NO
                 AND TMP.ORDDOC_SQ  = SODX.ORDDOC_SQ
                 AND TMP.PLANT_CD   = SODX.PLANT_CD
                LEFT OUTER JOIN (
                    SELECT A.COMPANY_CD, A.ORDDOC_NO, A.ORDDOC_SQ, A.PLANT_CD, SUM(A.STL_PRRG_AMT) AS STL_PRRG_AMT
                    FROM SD_ORDSTL_INFO_X20329 A
                    WHERE A.TOP_ORGN_CD = '99'
                    GROUP BY A.COMPANY_CD, A.ORDDOC_NO, A.ORDDOC_SQ, A.PLANT_CD
                ) TMP2
                  ON TMP2.COMPANY_CD = SODX.COMPANY_CD
                 AND TMP2.ORDDOC_NO  = SODX.ORDDOC_NO
                 AND TMP2.ORDDOC_SQ  = SODX.ORDDOC_SQ
                 AND TMP2.PLANT_CD   = SODX.PLANT_CD
                LEFT OUTER JOIN MA_CODEDTL MC8
                  ON MC8.COMPANY_CD = SBD.COMPANY_CD
                 AND MC8.MODULE_CD  = 'MA'
                 AND MC8.FIELD_CD   = 'S00040'
                 AND MC8.SYSDEF_CD  = SBD.SALEGRP_CD
                LEFT OUTER JOIN (
                    SELECT COMPANY_CD, CC_CD, MAX(CC_NM) AS CC_NM
                    FROM MA_CC_MST
                    WHERE COMPANY_CD = '1000'
                    GROUP BY COMPANY_CD, CC_CD
                ) MCM
                  ON MCM.COMPANY_CD = SBD.COMPANY_CD
                 AND MCM.CC_CD      = SBD.CC_CD
                LEFT OUTER JOIN MA_CODEDTL MC2
                  ON MC2.COMPANY_CD = SODX.COMPANY_CD
                 AND MC2.MODULE_CD  = 'SD'
                 AND MC2.FIELD_CD   = CASE WHEN SODX.PRW_FG = '0' THEN 'Z003_20329' ELSE 'Z021_20329' END
                 AND MC2.SYSDEF_CD  = SODX.PRPL_CD
                LEFT OUTER JOIN MA_PITEM MP
                  ON MP.COMPANY_CD = SODX.COMPANY_CD
                 AND MP.ITEM_CD    = SBD.ITEM_CD
                 AND MP.PLANT_CD   = SODX.PLANT_CD
                LEFT OUTER JOIN MA_CODEDTL MC3
                  ON MC3.COMPANY_CD = SBD.COMPANY_CD
                 AND MC3.MODULE_CD  = 'MA'
                 AND MC3.FIELD_CD   = 'P01000'
                 AND MC3.SYSDEF_CD  = MP.ITEM_ACGRP_CD
                /* 담당자 */
                LEFT OUTER JOIN HR_EMP_MST HEM
                  ON HEM.COMPANY_CD = SBD.COMPANY_CD
                 AND HEM.EMP_NO     = SBD.BIZRSPT_EMPNO_CD
                /* 발령(매출일 이전 최신) */
                OUTER APPLY (
                    SELECT /*+ FIRST_ROWS(1) */
                           HHS.GNFD_NEXT_DC_DC AS TARGET_DEPT_CD
                    FROM HR_HUAN_DTL  HHD
                    JOIN HR_HUAN_SDTL HHS
                      ON HHS.COMPANY_CD  = HHD.COMPANY_CD
                     AND HHS.GNFD_LKE_NO = HHD.GNFD_LKE_NO
                     AND HHS.EMP_NO      = HHD.EMP_NO
                     AND HHS.GNFD_CD     = HHD.GNFD_CD
                    WHERE HHD.COMPANY_CD = SBD.COMPANY_CD
                      AND HHD.EMP_NO     = SBD.BIZRSPT_EMPNO_CD
                      AND HHS.GNFD_DC_CD = 'H02'
                      AND HHD.GNFD_CD    = '150'
                      AND HHD.GNFD_ST_TP = '2'
                      AND TO_DATE(HHD.GNFD_DT, 'YYYYMMDD') <= SBD.BILL_DT
                    ORDER BY HHD.GNFD_DT DESC, HHD.GNFD_LKE_NO DESC
                    FETCH FIRST 1 ROW ONLY
                ) H02
                /* 최초 발령의 이전부서(보강) */
                OUTER APPLY (
                    SELECT /*+ FIRST_ROWS(1) */
                           HHS.GNFD_BEF_DC_DC AS FIRST_DEPT_CD
                    FROM HR_HUAN_DTL  HHD
                    JOIN HR_HUAN_SDTL HHS
                      ON HHS.COMPANY_CD  = HHD.COMPANY_CD
                     AND HHS.GNFD_LKE_NO = HHD.GNFD_LKE_NO
                     AND HHS.EMP_NO      = HHD.EMP_NO
                     AND HHS.GNFD_CD     = HHD.GNFD_CD
                    WHERE HHD.COMPANY_CD = SBD.COMPANY_CD
                      AND HHD.EMP_NO     = SBD.BIZRSPT_EMPNO_CD
                      AND HHS.GNFD_DC_CD = 'H02'
                      AND HHD.GNFD_CD    = '150'
                      AND HHD.GNFD_ST_TP = '2'
                    ORDER BY HHD.GNFD_DT ASC, HHD.GNFD_LKE_NO ASC
                    FETCH FIRST 1 ROW ONLY
                ) H02_FIRST
                /* 부서: 발령부서코드 + 매출일 기준 */
                LEFT OUTER JOIN MA_DEPT_MST MDM
                  ON MDM.COMPANY_CD = SBD.COMPANY_CD
                 AND MDM.DEPT_CD    = COALESCE(H02.TARGET_DEPT_CD, H02_FIRST.FIRST_DEPT_CD, HEM.DEPT_CD)
                 AND SBD.BILL_DT BETWEEN MDM.DEPT_START_DT AND MDM.DEPT_END_DT
            )
            SELECT
                  A.PLANT_CD
                , A.DEPT_CD
                , A.DEPT_NM
                , A.BILL_DT
                , A.BILL_QT
                , A.WRK_FG
                , A.SYSDEF_NM5
                , A.BIZRSPT_EMPNO_CD
                , A.BIZRSPT_EMPNO_NM
                , A.BILLDOC_NO
                , MAX(A.ITEM_CD) AS ITEM_CD
                , MAX(A.ITEM_NM) AS ITEM_NM
                , MAX(A.SPCFCS_ITEM_NM) AS SPCFCS_ITEM_NM
                , A.SODOC_NO
                , A.SODOC_SQ
                , A.ORDDOC_NO
                , A.ORDDOC_SQ
                , A.ORDDOC_NO3
                , A.ORDDOC_SQ3
                , A.KOR_NM
                , A.PRPL_CD
                , A.PRPL_NM
                , A.IO
                , MAX(A.ITEM_ACGRP_CD) AS ITEM_ACGRP_CD
                , CASE
                      WHEN A.PRPL_CD = 'G001' AND MAX(A.ITEM_ACGRP_CD) IN ('E11') THEN MAX(A.BOOK_AMT)
                      ELSE MAX(A.NORMAL_LABOR_COST)
                  END AS NORMAL_LABOR_COST
                , CASE
                      WHEN A.PRPL_CD = 'G001' AND MAX(A.ITEM_ACGRP_CD) IN ('A11') THEN MAX(A.BOOK_AMT)
                      ELSE NVL(MAX(A.NORMAL_PAPER_COST), 0)
                  END AS NORMAL_PAPER_COST
                , (
                    (CASE
                        WHEN A.PRPL_CD = 'G001' AND MAX(A.ITEM_ACGRP_CD) IN ('A11', 'E11') THEN MAX(A.BOOK_AMT)
                        ELSE MAX(A.NORMAL_LABOR_COST)
                     END)
                    + NVL(MAX(A.NORMAL_PAPER_COST), 0)
                  ) AS SUM_AMT
                , MAX(A.PRCH_AMT) AS PRCH_AMT
                , A.SALEGRP_CD
                , A.SALEGRP_NM
                , A.CC_CD
                , A.CC_NM
                , MAX(A.BILLPRTN_CD) AS SALEPRTN_CD
                , MAX(A.BILLPRTN_NM) AS SALEPRTN_NM
                , SUM(A.BOOK_AMT) AS BOOK_AMT
                , MAX(A.SO_TP) AS SO_TP
                , MAX(A.SO_TP_NM) AS SO_TP_NM
            FROM DTL_TABLE A
            GROUP BY
                  A.PLANT_CD
                , A.DEPT_CD
                , A.DEPT_NM
                , A.BILL_DT
                , A.BILL_QT
                , A.WRK_FG
                , A.SYSDEF_NM5
                , A.SALEGRP_CD
                , A.SALEGRP_NM
                , A.CC_CD
                , A.CC_NM
                , A.BIZRSPT_EMPNO_CD
                , A.BIZRSPT_EMPNO_NM
                , A.BILLDOC_NO
                , A.SODOC_NO
                , A.SODOC_SQ
                , A.ORDDOC_NO
                , A.ORDDOC_SQ
                , A.ORDDOC_NO3
                , A.ORDDOC_SQ3
                , A.KOR_NM
                , A.PRPL_CD
                , A.PRPL_NM
                , A.IO
            ORDER BY A.BILL_DT DESC, A.BILLDOC_NO DESC, A.SODOC_SQ
            """;

    /** plantCd 가 비면(ALL) 전 사업부문. 기간은 매출일 양끝 포함. */
    public List<SalesListDto.Row> findRows(LocalDate from, LocalDate to, String plantCd) {
        List<Object> args = new ArrayList<>();
        args.add(from.format(BASIC));
        args.add(to.format(BASIC));
        StringBuilder sql = new StringBuilder(SQL_HEAD);
        if (plantCd != null && !plantCd.isBlank()) {
            sql.append("          AND SBD.PLANT_CD = ?\n");
            args.add(plantCd.trim());
        }
        sql.append(SQL_TAIL);
        return jdbcTemplate.query(sql.toString(), this::map, args.toArray());
    }

    private SalesListDto.Row map(ResultSet rs, int i) throws SQLException {
        return SalesListDto.Row.builder()
                .billDate(ymd(rs.getString("BILL_DT")))
                .billNo(trim(rs.getString("BILLDOC_NO")))
                .plantCd(trim(rs.getString("PLANT_CD")))
                .deptCd(trim(rs.getString("DEPT_CD")))
                .deptName(trim(rs.getString("DEPT_NM")))
                .salesEmpNo(trim(rs.getString("BIZRSPT_EMPNO_CD")))
                .salesEmpName(trim(rs.getString("BIZRSPT_EMPNO_NM")))
                .partnerCd(trim(rs.getString("SALEPRTN_CD")))
                .partnerName(trim(rs.getString("SALEPRTN_NM")))
                .itemCd(trim(rs.getString("ITEM_CD")))
                .itemName(trim(rs.getString("ITEM_NM")))
                .detailItemName(trim(rs.getString("SPCFCS_ITEM_NM")))
                .qty(doubleOf(rs.getBigDecimal("BILL_QT")))
                .salesAmt(longOf(rs.getBigDecimal("BOOK_AMT")))
                .laborAmt(doubleOf(rs.getBigDecimal("NORMAL_LABOR_COST")))
                .paperAmt(doubleOf(rs.getBigDecimal("NORMAL_PAPER_COST")))
                .settleAmt(doubleOf(rs.getBigDecimal("SUM_AMT")))
                .soType(trim(rs.getString("SO_TP")))
                .soTypeName(trim(rs.getString("SO_TP_NM")))
                .soNo(trim(rs.getString("SODOC_NO")))
                .soSq(intOf(rs.getBigDecimal("SODOC_SQ")))
                .orderType(trim(rs.getString("WRK_FG")))
                .orderNo(trim(rs.getString("ORDDOC_NO")))
                .orderSq(intOf(rs.getBigDecimal("ORDDOC_SQ")))
                .workPlaceCd(trim(rs.getString("PRPL_CD")))
                .workPlaceName(trim(rs.getString("PRPL_NM")))
                .inOut(trim(rs.getString("IO")))
                .itemAcGroupCd(trim(rs.getString("ITEM_ACGRP_CD")))
                .bindInfo(trim(rs.getString("SYSDEF_NM5")))
                .makeEmpName(trim(rs.getString("KOR_NM")))
                .salesGroupCd(trim(rs.getString("SALEGRP_CD")))
                .salesGroupName(trim(rs.getString("SALEGRP_NM")))
                .ccCd(trim(rs.getString("CC_CD")))
                .ccName(trim(rs.getString("CC_NM")))
                .build();
    }

    private static String trim(String s) { return s == null ? null : s.trim(); }
    private static long longOf(BigDecimal v) { return v == null ? 0L : v.longValue(); }
    private static Integer intOf(BigDecimal v) { return v == null ? null : v.intValue(); }
    private static Double doubleOf(BigDecimal v) { return v == null ? null : v.doubleValue(); }
    private static String ymd(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() == 8 ? t.substring(0, 4) + "-" + t.substring(4, 6) + "-" + t.substring(6, 8) : t;
    }
}
