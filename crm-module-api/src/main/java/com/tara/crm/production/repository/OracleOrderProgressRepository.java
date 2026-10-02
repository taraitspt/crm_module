package com.tara.crm.production.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 주문진행현황 (TPS, 회사 1000 / 공장 1000) — GROW "주문별진행현황" 쿼리 이식(사용자 제공 2026-10-02). 조회 전용.
 *
 * <p>한 줄 = 주문번호 × 주문순번. 주문(SD_ORDER)에 생산계획/연동(PP_PLAN·PP_PROD_IF)·구매(PU_*)·전체외주(PP_PURORDER)·
 * POD(PP_ORDPOD)·정산(SD_ORDSTL)·수주/매출(SD_SO/SD_BILL)·출고(SD_ORDDLV) 를 붙이고, 작업처(PRPL_CD)별로
 * 가장 앞선 단계를 골라 진행상태(PROG_NM)·처리일자(PROG_DT)를 만든다.
 * 단계 우선순위: 매출등록 > 수주입력 > 정산입력 > 출고처리 > (작업처별 생산/구매/외주/POD 단계) > 주문처리 > 주문입력.
 *
 * <p>정본과 다른 점: 주문일(ORD_DT) 기간을 바인딩으로 뺐고, 생산 단계명과 구매 단계명이 둘 다 PROC_NM 이라 PP_PROC_NM / PU_PROC_NM 으로 나눴다.
 * 컬럼이 50개 넘어 DTO 없이 Map(camelCase 키)으로 내려준다.
 */
@Repository
@RequiredArgsConstructor
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleOrderProgressRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    /** 작업처별 단계 CASE — 상태명과 처리일자가 같은 구조라 한 번만 쓰고 두 번 꽂는다. %s = 각 단계의 값 */
    private static String stageCase(String bill, String so, String ore, String iss, String ppBind, String ppRel, String ppPlan, String pu, String ppProc, String ppu, String pod, String st1, String st0) {
        String common = """
                CASE WHEN SOI.BILLDOC_NO IS NOT NULL THEN %s
                     WHEN SOI.SODOC_NO IS NOT NULL THEN %s
                     WHEN OREI.ORDDOC_NO IS NOT NULL THEN %s
                     WHEN SOI.ISS_CMPT_YN = 'Y' THEN %s
                """.formatted(bill, so, ore, iss);
        String tail = """
                     WHEN ORI.ORDDOC_ST = '1' THEN %s
                     WHEN ORI.ORDDOC_ST = '0' THEN %s
                END
                """.formatted(st1, st0);
        return """
                CASE WHEN ORI.PRPL_CD IN ('T001') THEN
                """ + common + """
                     WHEN PPI.REL1_CD IS NOT NULL AND PPI.REL1_CD = 'WC40' AND PPI.ORD_QT = COALESCE(PPI.PP_ORD_QT, 0) THEN %s
                     WHEN PPI.REL1_CD IS NOT NULL THEN %s
                     WHEN PPI.PP_PLAN_NO IS NOT NULL THEN %s
                """.formatted(ppBind, ppRel, ppPlan) + tail + """
                     WHEN ORI.PRPL_CD IN ('G001', 'G9998', 'G9999') THEN
                """ + common + """
                     WHEN PUI.PU_PROC_NM IS NOT NULL THEN %s
                """.formatted(pu) + tail + """
                     WHEN ORI.PRPL_CD IN ('G0100', 'G0200', 'G0300', 'G0400') THEN
                """ + common + """
                     WHEN PPI.PP_PROC_DT IS NOT NULL THEN %s
                """.formatted(ppProc) + tail + """
                     WHEN ORI.PRPL_CD IN ('G0600', 'G0601') THEN
                """ + common + """
                     WHEN PPU.PURDOC_NO IS NOT NULL THEN %s
                """.formatted(ppu) + tail + """
                     WHEN ORI.PRPL_CD IN ('G0500') THEN
                """ + common + """
                     WHEN POI.PRGR_ST IS NOT NULL THEN %s
                """.formatted(pod) + tail + """
                     ELSE
                """ + common + tail + """
                END
                """;
    }

    private static final String SQL = """
            WITH ORD_INFO AS (
                SELECT SODX.COMPANY_CD, SODX.ORDDOC_NO, SOMX.ORDDOC_NM, SODX.ORDDOC_SQ, SOMX.PLANT_CD, SOMX.PLAN_PLANT_CD,
                       SOMX.PRW_FG, MCD2.SYSDEF_NM AS PRW_FG_NM, SOMX.WRK_FG, MCD3.SYSDEF_NM AS WRK_FG_NM, SOMX.ORD_DT,
                       SODX.PRPL_CD, NVL(NULLIF(TRIM(MCD1.SYSDEF_NM), ''), '비수불주문') AS PRPL_NM,
                       SODX.ORDDOC_ST, MCD6.SYSDEF_NM AS ORDDOC_ST_NM,
                       COALESCE(TO_CHAR(SODX.INSERT_DTS, 'yyyyMMdd'), TO_CHAR(SODX.UPDATE_DTS, 'yyyyMMdd')) AS PROC_DT,
                       SODX.ITEM_CD, SODX.ITEM_NM, SODX.SPCFCS_ITEM_NM, SODX.ORD_QT, SODX.SUM_AMT,
                       SOMX.PARTNER_CD, SOMX.PASGNR_NM, CPM.PARTNER_NM, SOMX.DEPT_CD, MDM.DEPT_NM,
                       SOMX.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS BIZRSPT_EMPNO_NM, SOMX.ETC_DC, MCD4.SYSDEF_NM AS ETC_DC_NM,
                       TO_CHAR(SODX.DLVSH_DTS, 'yyyyMMdd') AS DLVSH_DTS, SODX.TAXAFS_CD, MTM.TAXAFS_CD_NM,
                       SOMX.BILL_FG, MCD5.SYSDEF_NM AS BILL_FG_NM, SODX.SRC_ORDDOC_NO, SODX.RMK_TXT, SOMX.INSERT_ID, CUM.USER_NM,
                       SODX.LACO_AMT, SODX.MTRIL_AMT, SODX.RQST_NO, SODX.RQST_SQ
                FROM SD_ORDER_MST_X20329 SOMX
                INNER JOIN SD_ORDER_DTL_X20329 SODX ON SOMX.COMPANY_CD = SODX.COMPANY_CD AND SOMX.PLANT_CD = SODX.PLANT_CD AND SOMX.ORDDOC_NO = SODX.ORDDOC_NO
                LEFT OUTER JOIN MA_CODEDTL MCD1 ON SODX.COMPANY_CD = MCD1.COMPANY_CD AND MCD1.MODULE_CD = 'SD'
                                               AND MCD1.FIELD_CD = CASE WHEN SOMX.PRW_FG = '0' THEN 'Z003_20329' ELSE 'Z021_20329' END AND SODX.PRPL_CD = MCD1.SYSDEF_CD
                LEFT OUTER JOIN MA_CODEDTL MCD2 ON SODX.COMPANY_CD = MCD2.COMPANY_CD AND MCD2.MODULE_CD = 'SD' AND MCD2.FIELD_CD = 'Z015_20329' AND SOMX.PRW_FG = MCD2.SYSDEF_CD
                LEFT OUTER JOIN MA_CODEDTL MCD3 ON SODX.COMPANY_CD = MCD3.COMPANY_CD AND MCD3.MODULE_CD = 'SD' AND MCD3.FIELD_CD = 'Z024_20329' AND SOMX.WRK_FG = MCD3.SYSDEF_CD
                LEFT OUTER JOIN MA_CODEDTL MCD4 ON SODX.COMPANY_CD = MCD4.COMPANY_CD AND MCD4.MODULE_CD = 'SD' AND MCD4.FIELD_CD = 'P00820' AND SOMX.ETC_DC = MCD4.SYSDEF_CD
                LEFT OUTER JOIN MA_CODEDTL MCD5 ON SODX.COMPANY_CD = MCD5.COMPANY_CD AND MCD5.MODULE_CD = 'SD' AND MCD5.FIELD_CD = 'Z001_20329' AND SOMX.BILL_FG = MCD5.SYSDEF_CD
                LEFT OUTER JOIN MA_CODEDTL MCD6 ON SODX.COMPANY_CD = MCD6.COMPANY_CD AND MCD6.MODULE_CD = 'SD' AND MCD6.FIELD_CD = 'Z002_20329' AND SODX.ORDDOC_ST = MCD6.SYSDEF_CD
                LEFT OUTER JOIN CI_PARTNER_MST CPM ON SOMX.PARTNER_CD = CPM.PARTNER_CD
                LEFT OUTER JOIN MA_DEPT_MST MDM    ON SOMX.COMPANY_CD = MDM.COMPANY_CD AND SOMX.DEPT_CD = MDM.DEPT_CD
                LEFT OUTER JOIN HR_EMP_MST HEM     ON SOMX.COMPANY_CD = HEM.COMPANY_CD AND SOMX.BIZRSPT_EMPNO_CD = HEM.EMP_NO
                LEFT OUTER JOIN MA_TAX_MST MTM     ON MTM.NATION_CD = 'KR' AND SODX.TAXAFS_CD = MTM.TAXAFS_CD AND SODX.TAXCAT_CD = MTM.TAXCAT_CD
                LEFT OUTER JOIN CI_USER_MST CUM    ON SOMX.INSERT_ID = CUM.USER_ID
                WHERE SOMX.COMPANY_CD = '1000' AND SOMX.PLANT_CD = '1000'
                AND   SOMX.ORD_DT BETWEEN ? AND ?
            ), PPI_INFO AS (
                -- 생산인터페이스 연동완료 최종 차수(센터)
                SELECT PPI.COMPANY_CD, MAX(PPI.INTL_HIS_SQ) AS INTL_HIS_SQ, PPI.PLANT_CD, PPI.SODOC_NO, PPI.SODOC_SQ, PPI.BASE_END_DT, PPI.INTL_NO, PPI.REL1_CD,
                       COALESCE(CNCL_YN, 'N') AS CNCL_YN
                FROM PP_PROD_IF PPI
                WHERE PPI.COMPANY_CD = '1000' AND PPI.PLANT_CD = '1000' AND PPI.INTL_ST = '2'
                GROUP BY PPI.COMPANY_CD, PPI.PLANT_CD, PPI.SODOC_NO, PPI.SODOC_SQ, PPI.BASE_END_DT, PPI.INTL_NO, PPI.REL1_CD, PPI.CNCL_YN
            ), PP_INFO AS (
                -- 작업처 TPS 작업장(제판·인쇄·제본) 생산 정보
                SELECT OI.COMPANY_CD, OI.PLANT_CD, OI.ORDDOC_NO, OI.ORDDOC_SQ, PPI.REL1_CD, MCD.SYSDEF_NM AS PP_PROC_NM, OI.ORD_QT,
                       SUM(PPIX.ORD_QT) AS PP_ORD_QT,
                       MAX(COALESCE(PPI.BASE_END_DT, PPI2.BASE_END_DT)) AS PP_PROC_DT,
                       MAX(COALESCE(TO_CHAR(PPMX.INSERT_DTS, 'yyyyMMdd'), TO_CHAR(PPMX.UPDATE_DTS, 'yyyyMMdd'))) AS PP_PLAN_DT,
                       MAX(PPMX.ORDDOC_NO) AS PP_PLAN_NO,
                       ROW_NUMBER() OVER (PARTITION BY OI.COMPANY_CD, OI.PLANT_CD, OI.ORDDOC_NO, OI.ORDDOC_SQ ORDER BY PPI.REL1_CD DESC) AS PP_SQ
                FROM ORD_INFO OI
                LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON OI.COMPANY_CD = PPDX.COMPANY_CD AND OI.ORDDOC_NO = PPDX.ORDDOC_NO AND OI.ORDDOC_SQ = PPDX.ORDDOC_SQ
                LEFT OUTER JOIN PPI_INFO PPI ON PPDX.COMPANY_CD = PPI.COMPANY_CD AND PPDX.PLANT_CD = PPI.PLANT_CD AND PPDX.PLAN_NO = PPI.SODOC_NO AND PPDX.PLAN_SQ = PPI.SODOC_SQ
                                            AND PPI.REL1_CD IN ('WC10', 'WC20', 'WC40') AND COALESCE(PPI.CNCL_YN, 'N') = 'N'
                LEFT OUTER JOIN PP_PLANBBND_INFO_X20329 PPIX ON PPDX.COMPANY_CD = PPIX.COMPANY_CD AND PPDX.ORDDOC_NO = PPIX.ORDDOC_NO AND PPDX.ORDDOC_SQ = PPIX.ORDDOC_SQ
                                            AND PPI.INTL_NO = PPIX.PLAN_LOW_SQ AND PPIX.LAST_YN = 'Y'
                LEFT OUTER JOIN MA_CODEDTL MCD ON PPI.COMPANY_CD = MCD.COMPANY_CD AND MCD.MODULE_CD = 'PP' AND MCD.FIELD_CD = 'Z004_20329' AND PPI.REL1_CD = MCD.SYSDEF_CD
                LEFT OUTER JOIN PPI_INFO PPI2 ON OI.COMPANY_CD = PPI2.COMPANY_CD AND OI.PLAN_PLANT_CD = PPI2.PLANT_CD AND OI.ORDDOC_NO = PPI2.SODOC_NO AND OI.ORDDOC_SQ = PPI2.SODOC_SQ
                                             AND COALESCE(PPI2.CNCL_YN, 'N') = 'N'
                LEFT OUTER JOIN PP_PLAN_MST_X20329 PPMX ON OI.COMPANY_CD = PPMX.COMPANY_CD AND OI.ORDDOC_NO = PPMX.ORDDOC_NO
                GROUP BY OI.COMPANY_CD, OI.PLANT_CD, OI.ORDDOC_NO, OI.ORDDOC_SQ, PPI.REL1_CD, MCD.SYSDEF_NM, OI.ORD_QT
            ), PU_INFO AS (
                -- 구매발주·입고
                SELECT OI.COMPANY_CD, OI.ORDDOC_NO, OI.ORDDOC_SQ, OI.ORD_QT, MAX(PPD.RCPT_NO) AS RCPT_NO,
                       CASE WHEN MAX(PPD.RCPT_NO) IS NOT NULL THEN '구매입고'
                            WHEN MAX(PPDD.PURDOC_NO) IS NOT NULL AND MAX(PPDD.PO_CNCL_YN) <> 'Y' THEN '구매발주' ELSE NULL END AS PU_PROC_NM,
                       MAX(COALESCE(PPD.RCPT_NO, PPDD.PURDOC_NO)) AS PU_PROC_NO,
                       SUM(COALESCE(PPD.PROC_QT, PPDD.DLVSH_QT)) AS PU_PROC_QT,
                       MAX(COALESCE(PPD.RCPT_PROC_DT, PPM.PUR_PO_DT)) AS PU_PROC_DT
                FROM ORD_INFO OI
                LEFT OUTER JOIN PU_PURORDER_DTL_X20329 PPDX ON OI.COMPANY_CD = PPDX.COMPANY_CD AND OI.ORDDOC_NO = PPDX.ORDDOC_NO AND OI.ORDDOC_SQ = PPDX.ORDDOC_SQ
                LEFT OUTER JOIN PU_PURORDERDLV_DTL PPDD     ON PPDX.COMPANY_CD = PPDD.COMPANY_CD AND PPDX.PURDOC_NO = PPDD.PURDOC_NO AND PPDX.PURDOC_SQ = PPDD.PURDOC_SQ
                                                           AND COALESCE(PPDD.PO_CNCL_YN, 'N') != 'Y'
                LEFT OUTER JOIN PU_PURORDER_MST PPM         ON PPDD.COMPANY_CD = PPM.COMPANY_CD AND PPDD.PURDOC_NO = PPM.PURDOC_NO
                LEFT OUTER JOIN PU_PURRCV_DTL PPD           ON PPDD.COMPANY_CD = PPD.COMPANY_CD AND PPDD.PURDOC_NO = PPD.PURDOC_NO AND PPDD.PURDOC_SQ = PPD.PURDOC_SQ
                                                           AND PPD.RCPT_PROC_TP = '4' AND COALESCE(PPD.CNCL_YN, 'N') != 'Y'
                GROUP BY OI.COMPANY_CD, OI.ORDDOC_NO, OI.ORDDOC_SQ, OI.ORD_QT
            ), SO_INFO AS (
                -- 출고·수주·매출
                SELECT OI.COMPANY_CD, OI.ORDDOC_NO, OI.ORDDOC_SQ, MAX(SDMX.ISS_CMPT_YN) AS ISS_CMPT_YN, MAX(SSD.SODOC_NO) AS SODOC_NO,
                       MAX(SDMX.SODOC_NO) AS SODOC_NO_DLV, MAX(SBD.BILLDOC_NO) AS BILLDOC_NO, MAX(SSM.SO_DT) AS SO_DT, MAX(SBM.BILL_DT) AS BILL_DT,
                       MAX(SBM.DOCU_NO) AS DOCU_NO, MAX(IMD.INVTRX_DT) AS INVTRX_DT
                FROM ORD_INFO OI
                LEFT OUTER JOIN SD_ORDDLV_MST_X20329 SDMX ON OI.COMPANY_CD = SDMX.COMPANY_CD AND OI.ORDDOC_NO = SDMX.ORDDOC_NO AND OI.ORDDOC_SQ = SDMX.ORDDOC_SQ
                LEFT OUTER JOIN SD_SO_DTL SSD   ON SDMX.COMPANY_CD = SSD.COMPANY_CD AND SDMX.ORDDOC_NO = SSD.PURDOC_NO AND SDMX.ORDDOC_SQ = SSD.PURDOC_SQ
                                               AND SDMX.DLV_SQ = SSD.ORD_SQ AND SSD.ITEM_ST != 'X'
                LEFT OUTER JOIN SD_SO_MST SSM   ON SSD.COMPANY_CD = SSM.COMPANY_CD AND SSD.SODOC_NO = SSM.SODOC_NO
                LEFT OUTER JOIN SD_BILL_DTL SBD ON SSD.COMPANY_CD = SBD.COMPANY_CD AND SSD.SODOC_NO = SBD.SODOC_NO AND SSD.SODOC_SQ = SBD.SODOC_SQ
                                               AND COALESCE(SBD.BILL_CNCL_YN, 'N') = 'N'
                LEFT OUTER JOIN SD_BILL_MST SBM ON SBD.COMPANY_CD = SBM.COMPANY_CD AND SBD.BILLDOC_NO = SBM.BILLDOC_NO
                LEFT OUTER JOIN IM_MTLDOC_DTL IMD ON SDMX.COMPANY_CD = IMD.COMPANY_CD AND SDMX.INVTRX_DOC_NO = IMD.INVTRX_DOC_NO AND SDMX.INVTRX_DOC_SQ = IMD.INVTRX_DOC_SQ
                GROUP BY OI.COMPANY_CD, OI.ORDDOC_NO, OI.ORDDOC_SQ
            ), PPU_INFO AS (
                -- 전체외주
                SELECT PPMX.COMPANY_CD, PPMX.PLANT_CD, MAX(PPMX.PURDOC_NO) AS PURDOC_NO, MAX(PPMX.PUR_PO_DT) AS PUR_PO_DT, PPDX.ORDDOC_NO, PPDX.ORDDOC_SQ
                FROM PP_PURORDER_MST_X20329 PPMX
                INNER JOIN PP_PURORDER_DTL_X20329 PPDX ON PPMX.COMPANY_CD = PPDX.COMPANY_CD AND PPMX.PURDOC_NO = PPDX.PURDOC_NO
                WHERE PPMX.COMPANY_CD = '1000'
                GROUP BY PPMX.COMPANY_CD, PPMX.PLANT_CD, PPDX.ORDDOC_NO, PPDX.ORDDOC_SQ
            ), POD_INFO AS (
                SELECT PODX.COMPANY_CD, PODX.ORDDOC_NO, PODX.ORDDOC_SQ, MAX(PODX.PRGR_ST) AS PRGR_ST, MAX(MCD.SYSDEF_NM) AS PRGR_NM,
                       MAX(COALESCE(TO_CHAR(PODX.WRK_DTS6, 'yyyyMMdd'), TO_CHAR(PODX.WRK_DTS5, 'yyyyMMdd'), TO_CHAR(PODX.WRK_DTS4, 'yyyyMMdd'),
                                    TO_CHAR(PODX.WRK_DTS3, 'yyyyMMdd'), TO_CHAR(PODX.WRK_DTS2, 'yyyyMMdd'), TO_CHAR(PODX.WRK_DTS1, 'yyyyMMdd'))) AS WRK_DTS
                FROM PP_ORDPOD_DTL_X20329 PODX
                LEFT OUTER JOIN MA_CODEDTL MCD ON PODX.COMPANY_CD = MCD.COMPANY_CD AND MCD.MODULE_CD = 'PP' AND MCD.FIELD_CD = 'Z017_20329' AND PODX.PRGR_ST = MCD.SYSDEF_CD
                WHERE PODX.COMPANY_CD = '1000'
                GROUP BY PODX.COMPANY_CD, PODX.ORDDOC_NO, PODX.ORDDOC_SQ
            ), ORE_INFO AS (
                -- 정산단가 입력
                SELECT SOIX.COMPANY_CD, SOIX.ORDDOC_NO, SOIX.ORDDOC_SQ,
                       MAX(COALESCE(TO_CHAR(INSERT_DTS, 'yyyyMMdd'), TO_CHAR(UPDATE_DTS, 'yyyyMMdd'))) AS PROC_DT
                FROM SD_ORDSTL_INFO_X20329 SOIX
                WHERE SOIX.COMPANY_CD = '1000'
                GROUP BY SOIX.COMPANY_CD, SOIX.ORDDOC_NO, SOIX.ORDDOC_SQ
            )
            SELECT ORI.*,
                   PPI.PP_PLAN_NO, PPI.PP_PLAN_DT, PPI.REL1_CD, PPI.PP_PROC_NM, PPI.PP_ORD_QT,
                   CASE WHEN PPI.REL1_CD = 'WC40' AND PPI.ORD_QT = COALESCE(PPI.PP_ORD_QT, 0) THEN 'Y' ELSE 'N' END AS WC40_YN,
                   PUI.PU_PROC_NM, PUI.PU_PROC_NO, PUI.PU_PROC_DT, PUI.PU_PROC_QT,
                   SOI.ISS_CMPT_YN, SOI.SODOC_NO, SOI.SODOC_NO_DLV, SOI.BILLDOC_NO, PPI.PP_PROC_DT, POI.PRGR_ST,
            """
            + stageCase("'매출등록'", "'수주입력'", "'정산입력'", "'출고처리'", "'제본완료'", "PPI.PP_PROC_NM", "'생산계획중'",
                        "PUI.PU_PROC_NM", "'생산완료'", "'외주발주'", "POI.PRGR_NM", "'주문처리'", "'주문입력'") + " AS PROG_NM,\n"
            + stageCase("SOI.BILL_DT", "SOI.SO_DT", "OREI.PROC_DT", "SOI.INVTRX_DT", "PPI.PP_PROC_DT", "PPI.PP_PROC_DT", "PPI.PP_PLAN_DT",
                        "PUI.PU_PROC_DT", "PPI.PP_PROC_DT", "PPU.PUR_PO_DT", "POI.WRK_DTS", "ORI.PROC_DT", "ORI.ORD_DT") + " AS PROG_DT\n"
            + """
            FROM ORD_INFO ORI
            LEFT OUTER JOIN PP_INFO PPI  ON ORI.COMPANY_CD = PPI.COMPANY_CD AND ORI.ORDDOC_NO = PPI.ORDDOC_NO AND ORI.ORDDOC_SQ = PPI.ORDDOC_SQ
            LEFT OUTER JOIN PU_INFO PUI  ON ORI.COMPANY_CD = PUI.COMPANY_CD AND ORI.ORDDOC_NO = PUI.ORDDOC_NO AND ORI.ORDDOC_SQ = PUI.ORDDOC_SQ
            LEFT OUTER JOIN PPU_INFO PPU ON ORI.COMPANY_CD = PPU.COMPANY_CD AND ORI.ORDDOC_NO = PPU.ORDDOC_NO AND ORI.ORDDOC_SQ = PPU.ORDDOC_SQ
            LEFT OUTER JOIN SO_INFO SOI  ON ORI.COMPANY_CD = SOI.COMPANY_CD AND ORI.ORDDOC_NO = SOI.ORDDOC_NO AND ORI.ORDDOC_SQ = SOI.ORDDOC_SQ
            LEFT OUTER JOIN POD_INFO POI ON ORI.COMPANY_CD = POI.COMPANY_CD AND ORI.ORDDOC_NO = POI.ORDDOC_NO AND ORI.ORDDOC_SQ = POI.ORDDOC_SQ
            LEFT OUTER JOIN ORE_INFO OREI ON ORI.COMPANY_CD = OREI.COMPANY_CD AND ORI.ORDDOC_NO = OREI.ORDDOC_NO AND ORI.ORDDOC_SQ = OREI.ORDDOC_SQ
            WHERE PPI.PP_SQ = 1
            ORDER BY ORI.ORDDOC_NO DESC, ORI.ORDDOC_SQ
            """;

    /** 주문일(ORD_DT) 기간 양끝 포함. */
    public List<Map<String, Object>> findRows(LocalDate startDate, LocalDate endDate) {
        return jdbcTemplate.query(SQL, this::map, startDate.format(BASIC), endDate.format(BASIC));
    }

    private Map<String, Object> map(ResultSet rs, int i) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int c = 1; c <= md.getColumnCount(); c++) {
            Object v = rs.getObject(c);
            if (v instanceof String str) v = str.trim();
            row.put(OracleEquipmentPerfRepository.camel(md.getColumnLabel(c)), v);
        }
        return row;
    }
}
