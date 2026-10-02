package com.tara.crm.production.repository;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 생산계획조회 (TPS, 회사 1000 / 공장 1000) — ERP "생산계획등록(타라)" 화면의 조회 쿼리 이식(사용자 제공 2026-10-02). 조회 전용.
 *
 * <p>화면 구조: 주문리스트(주문일 기간) → 주문 하나 선택 → 주문상세(라인) + 공정 탭(인쇄·제판·후가공·접지·제본) + 공정별특이사항.
 * 두 방향: 주문적용(SD_ORDER_*, TOR…)과 의뢰적용(PP_PREORD_*, PQE…). 계획 테이블은 ORDDOC_NO 자리에 주문번호든 의뢰번호든 들어가므로
 * 공정 탭 쿼리는 둘이 완전히 같고(ERP 의뢰 제본 탭 쿼리와 대조 2026-10-02), 주문리스트·주문상세·작업지시서 머리만 테이블이 갈린다.
 * 탭 행은 모두 계획번호(PLAN_NO) 1건 기준이고, 인쇄·제판·후가공·접지 행은 KEY_VAL_NM(계획번호/차수/순번/하위순번)으로 인쇄 행에 매달린다.
 * 제본 행은 KEY_VAL_NM 이 없다(완성품 행, 하위순번 500) — 주문 라인(PLAN_SQ) 단위.
 *
 * <p>정본과 다른 점:
 * <ul>
 *   <li>계획 차수(PLAN_HIS_SQ)는 정본이 '1' 고정 — 2026년 계획 6,749건 전부 1차라 그대로 둔다.</li>
 *   <li>후가공 탭은 정본이 "저장 전 초기행 생성" 쿼리(주문 후가공 사양 → 인쇄 계획)라 조회에 맞지 않아, 저장본 PP_PLANPROCS_INFO 를 읽는다
 *       (생산계획현황 후가공 탭과 같은 테이블).</li>
 *   <li>그리드 제어용 상수 컬럼(PERCENT·CHANGE_ROW_YN·RMK_YN·PLAN_NO_YN·PRE_PLAN_LOW_SQ)과 SELECT 에 안 쓰이는 조인(인쇄 탭의 PP_PLANBBND)은 뺐다.</li>
 *   <li>주문상세에 작업지시서용 포장방법(Z006)·포장수량·공정별특이사항(SD_ORDER_DTL.RMK_TXT)·주문상태를 더했다.</li>
 * </ul>
 * 컬럼이 많아 DTO 없이 Map(camelCase 키)으로 내려준다. 바인딩은 이름 기반(:planNo 등) — 같은 값이 서브쿼리 여러 곳에 들어가서.
 */
@Repository
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OraclePlanRegisterRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public OraclePlanRegisterRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    public enum Tab { PRINT, PLATE, PROCESS, FOLD, BIND }

    private static String code(String alias, String module, String field, String expr) {
        return """
                LEFT OUTER JOIN MA_CODEDTL %1$s ON %1$s.COMPANY_CD = '1000' AND %1$s.MODULE_CD = '%2$s' AND %1$s.FIELD_CD = '%3$s' AND %1$s.SYSDEF_CD = %4$s
                """.formatted(alias, module, field, expr);
    }

    // ───────────────────────────── 주문리스트 ─────────────────────────────
    /**
     * 주문리스트 — 주문일 기간. 계획상태(PLAN_ST_NM) = 미작성(계획 없음) / 작성 완료(다섯 탭 모두 확정) / 작성중.
     * 탭별 확정여부(PPIX 인쇄·PPLIX 제판·PPRIX 후가공·PPBIX2 접지·PPBIX1 제본)는 "그 탭에 행이 있어야 하는데 없거나, 미확정 행이 있으면 N".
     * TAB2/3/4/6_PK_CNT 가 "있어야 하는 행 수"(주문 사양 기준). GRP(G001) 라인만 있는 주문은 제외.
     */
    private static String listSql(boolean request) {
        // 의뢰적용은 주문(SD_ORDER_*) 대신 의뢰(PP_PREORD_*)를 읽는다. 계획 테이블은 ORDDOC_NO 자리에 의뢰번호(PQE…)가 들어가므로 그대로.
        String source = request ? """
            WITH SD_ORDER AS (
                SELECT POMX.COMPANY_CD, POMX.PLANT_CD, POMX.PLAN_ORD_NO AS ORDDOC_NO, POMX.QODOC_NM AS ORDDOC_NM, POMX.QUT_DT AS ORD_DT, POMX.DEPT_CD,
                       POMX.BIZRSPT_EMPNO_CD, POMX.PARTNER_CD, POMX.WRK_FG, MC.SYSDEF_NM AS WRK_FG_NM, PODX.ETC_DC5 AS CNFM_DTS
                FROM PP_PREORD_MST_X20329 POMX
                INNER JOIN PP_PREORD_DTL_X20329 PODX ON PODX.COMPANY_CD = POMX.COMPANY_CD AND PODX.PLAN_ORD_NO = POMX.PLAN_ORD_NO AND PODX.PLANT_CD = POMX.PLANT_CD
                                                    AND NOT EXISTS (SELECT 1 FROM PP_PREORD_DTL_X20329 PODX2
                                                                    WHERE PODX2.COMPANY_CD = PODX.COMPANY_CD AND PODX2.PLAN_ORD_NO = PODX.PLAN_ORD_NO
                                                                      AND PODX2.PLANT_CD = PODX.PLANT_CD AND PODX2.ORDDOC_ST = '0')
                LEFT OUTER JOIN MA_CODEDTL MC ON MC.COMPANY_CD = POMX.COMPANY_CD AND MC.MODULE_CD = 'SD' AND MC.FIELD_CD = 'Z024_20329' AND MC.SYSDEF_CD = POMX.WRK_FG
                WHERE POMX.COMPANY_CD = '1000' AND POMX.PLANT_CD = '1000' AND POMX.QUT_DT BETWEEN :start AND :end
                GROUP BY POMX.COMPANY_CD, POMX.PLANT_CD, POMX.PLAN_ORD_NO, POMX.QODOC_NM, POMX.QUT_DT, POMX.DEPT_CD, POMX.BIZRSPT_EMPNO_CD, POMX.PARTNER_CD, POMX.WRK_FG, MC.SYSDEF_NM, PODX.ETC_DC5
            """ : """
            WITH SD_ORDER AS (
                SELECT * FROM (
                    SELECT SOMX.COMPANY_CD, SOMX.PLAN_PLANT_CD AS PLANT_CD, SOMX.ORDDOC_NO, SOMX.ORDDOC_NM, SOMX.ORD_DT, SOMX.DEPT_CD,
                           SOMX.BIZRSPT_EMPNO_CD, SOMX.PARTNER_CD, SOMX.WRK_FG, MC.SYSDEF_NM AS WRK_FG_NM,
                           TO_CHAR(SODX.CNFM_DTS, 'YYYYMMDD') AS CNFM_DTS,
                           NVL(PRPR_CNT.PRPL_CD_CNT, 0) AS PRPL_CD_CNT, NVL(TOT_DTL_CNT.SODX_CNT, 0) AS SODX_CNT
                    FROM SD_ORDER_MST_X20329 SOMX
                    INNER JOIN SD_ORDER_DTL_X20329 SODX ON SODX.COMPANY_CD = SOMX.COMPANY_CD AND SODX.ORDDOC_NO = SOMX.ORDDOC_NO
                                                       AND SODX.PLAN_PLANT_CD = SOMX.PLAN_PLANT_CD AND SODX.PRPL_CD != 'G001'
                                                       AND NOT EXISTS (SELECT 1 FROM SD_ORDER_DTL_X20329 SODX2
                                                                       WHERE SODX2.COMPANY_CD = SODX.COMPANY_CD AND SODX2.ORDDOC_NO = SODX.ORDDOC_NO
                                                                         AND SODX2.PLAN_PLANT_CD = SODX.PLAN_PLANT_CD AND SODX2.ORDDOC_ST = '0')
                    LEFT OUTER JOIN (SELECT ORDDOC_NO, COUNT(PRPL_CD) AS PRPL_CD_CNT FROM SD_ORDER_DTL_X20329
                                     WHERE COMPANY_CD = '1000' AND PLAN_PLANT_CD = '1000' AND PRPL_CD = 'G001' GROUP BY ORDDOC_NO) PRPR_CNT
                                 ON PRPR_CNT.ORDDOC_NO = SOMX.ORDDOC_NO
                    LEFT OUTER JOIN (SELECT ORDDOC_NO, COUNT(ORDDOC_SQ) AS SODX_CNT FROM SD_ORDER_DTL_X20329
                                     WHERE COMPANY_CD = '1000' AND PLAN_PLANT_CD = '1000' GROUP BY ORDDOC_NO) TOT_DTL_CNT
                                 ON TOT_DTL_CNT.ORDDOC_NO = SOMX.ORDDOC_NO
                    LEFT OUTER JOIN MA_CODEDTL MC ON MC.COMPANY_CD = SOMX.COMPANY_CD AND MC.MODULE_CD = 'SD' AND MC.FIELD_CD = 'Z024_20329' AND MC.SYSDEF_CD = SOMX.WRK_FG
                    WHERE SOMX.COMPANY_CD = '1000' AND SOMX.PLAN_PLANT_CD = '1000'
                      AND SOMX.ORD_DT BETWEEN :start AND :end
                      AND SOMX.PRW_FG = '0' AND SOMX.BILL_FG != '1'
                    GROUP BY SOMX.COMPANY_CD, SOMX.PLAN_PLANT_CD, SOMX.ORDDOC_NO, SOMX.ORDDOC_NM, SOMX.ORD_DT, SOMX.DEPT_CD, SOMX.BIZRSPT_EMPNO_CD,
                             SOMX.PARTNER_CD, SOMX.WRK_FG, MC.SYSDEF_NM, TO_CHAR(SODX.CNFM_DTS, 'YYYYMMDD'), PRPR_CNT.PRPL_CD_CNT, TOT_DTL_CNT.SODX_CNT
                ) WHERE PRPL_CD_CNT != SODX_CNT
            """;
        // 사양 테이블(주문 → 의뢰): 인쇄 사양 / 후가공 사양 / 제본 사양과 그 키 이름
        String infoTbl = request ? "PP_PREORD_INFO_X20329" : "SD_ORDER_INFO_X20329";
        String infoNo = request ? "PLAN_ORD_NO" : "ORDDOC_NO";
        String infoSq = request ? "PLAN_ORD_SQ" : "ORDDOC_SQ";
        String procsTbl = request ? "PP_PREPROCS_INFO_X20329" : "SD_ORDPROCS_INFO_X20329";
        String procsPage = request ? "PLAN_SQ_SQ" : "PAGE_SQ";
        String procsLine = request ? "PLAN_LINE_SQ" : "LINE_SQ";
        String procsPlant = request ? "PLANT_CD" : "PLAN_PLANT_CD";
        String bbndTbl = request ? "PP_PREBBND_DTL_X20329" : "SD_ORDBBND_DTL_X20329";
        String planFgDefault = request ? "PP" : "SD";
        return source + """
            ), PP_PLAN AS (
                SELECT PPMX.COMPANY_CD, PPMX.PLANT_CD, PPMX.PLAN_NO, PPMX.PLAN_HIS_SQ, PPMX.ORDDOC_NO, PPMX.ORD_DT, PPMX.PLAN_FG_CD, PPMX.RMK_TXT, PPMX.DEPT_CD, PPMX.PARTNER_CD
                FROM PP_PLAN_MST_X20329 PPMX
                WHERE PPMX.COMPANY_CD = '1000' AND PPMX.PLAN_HIS_SQ = 1 AND PPMX.PLANT_CD = '1000'
                  AND PPMX.ORD_DT BETWEEN :start AND :end
            ), PP_PLAN_NO_YN AS (
                SELECT PPM.PLAN_NO AS PPMX_PLAN_NO, MAX(PPIX.PLAN_NO) AS PPIX_PLAN_NO, MAX(PPLIX.PLAN_NO) AS PPLIX_PLAN_NO, MAX(PPRIX.PLAN_NO) AS PPRIX_PLAN_NO,
                       MAX(PPBIX1.PLAN_NO) AS PPBIX1_PLAN_NO, MAX(PPBIX2.PLAN_NO) AS PPBIX2_PLAN_NO
                FROM PP_PLAN PPM
                LEFT OUTER JOIN %INFO_TBL% SOIX ON SOIX.COMPANY_CD = PPM.COMPANY_CD AND SOIX.%INFO_NO% = PPM.ORDDOC_NO AND SOIX.%PROCS_PLANT% = PPM.PLANT_CD
                LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPIX.COMPANY_CD = PPM.COMPANY_CD AND PPIX.PLAN_NO = PPM.PLAN_NO AND PPIX.PLAN_HIS_SQ = 1
                                                           AND PPIX.PLAN_SQ = SOIX.%INFO_SQ% AND PPIX.PLAN_LOW_SQ = 1 AND PPIX.PLANT_CD = PPM.PLANT_CD
                LEFT OUTER JOIN PP_PLANPLMK_INFO_X20329 PPLIX ON PPLIX.COMPANY_CD = PPM.COMPANY_CD AND PPLIX.PLAN_NO = PPM.PLAN_NO AND PPLIX.PLAN_HIS_SQ = 1
                                                             AND PPLIX.PLAN_SQ = PPIX.PLAN_SQ AND PPLIX.PLAN_LOW_SQ = 1 AND PPLIX.PLANT_CD = PPM.PLANT_CD
                LEFT OUTER JOIN PP_PLANPROCS_INFO_X20329 PPRIX ON PPRIX.COMPANY_CD = PPM.COMPANY_CD AND PPRIX.PLAN_NO = PPM.PLAN_NO AND PPRIX.PLAN_HIS_SQ = 1
                                                              AND PPRIX.PLAN_SQ = PPIX.PLAN_SQ AND PPRIX.PLAN_LOW_SQ = 1 AND PPRIX.PLANT_CD = PPM.PLANT_CD
                LEFT OUTER JOIN PP_PLANBBND_INFO_X20329 PPBIX1 ON PPBIX1.COMPANY_CD = PPM.COMPANY_CD AND PPBIX1.PLAN_NO = PPM.PLAN_NO AND PPBIX1.PLAN_HIS_SQ = 1
                                                              AND PPBIX1.PLAN_SQ = PPIX.PLAN_SQ AND PPBIX1.PLANT_CD = PPM.PLANT_CD
                                                              AND (NVL(PPBIX1.LAST_YN, 'N') = 'Y' OR NVL(PPBIX1.SUPP_YN, 'N') = 'Y')
                LEFT OUTER JOIN PP_PLANBBND_INFO_X20329 PPBIX2 ON PPBIX2.COMPANY_CD = PPM.COMPANY_CD AND PPBIX2.PLAN_NO = PPM.PLAN_NO AND PPBIX2.PLAN_HIS_SQ = 1
                                                              AND PPBIX2.PLAN_SQ = PPIX.PLAN_SQ AND PPBIX2.PLANT_CD = PPM.PLANT_CD
                                                              AND NVL(PPBIX2.LAST_YN, 'N') != 'Y' AND NVL(PPBIX2.SUPP_YN, 'N') != 'Y'
                GROUP BY PPM.PLAN_NO
            ), PP_PLAN_NO_CNFM_YN AS (
                SELECT PPM.PLAN_NO AS PPMX_PLAN_NO, COUNT(PPIX_ORG.PLAN_NO) AS PPIX_CNFM_CNT, COUNT(PPLIX.PLAN_NO) AS PPLIX_CNFM_CNT,
                       COUNT(PPRIX.PLAN_NO) AS PPRIX_CNFM_CNT, COUNT(PPBIX1.PLAN_NO) AS PPBIX1_CNFM_CNT, COUNT(PPBIX2.PLAN_NO) AS PPBIX2_CNFM_CNT
                FROM PP_PLAN PPM
                LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPIX.COMPANY_CD = PPM.COMPANY_CD AND PPIX.PLAN_NO = PPM.PLAN_NO AND PPIX.PLANT_CD = PPM.PLANT_CD
                LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX_ORG ON PPIX_ORG.COMPANY_CD = PPM.COMPANY_CD AND PPIX_ORG.PLAN_NO = PPM.PLAN_NO
                                                               AND PPIX_ORG.PLANT_CD = PPM.PLANT_CD AND NVL(PPIX_ORG.CNFM_YN, 'N') != 'Y'
                LEFT OUTER JOIN PP_PLANPLMK_INFO_X20329 PPLIX ON PPLIX.COMPANY_CD = PPM.COMPANY_CD AND PPLIX.PLAN_NO = PPM.PLAN_NO AND PPLIX.PLANT_CD = PPM.PLANT_CD
                                                             AND NVL(PPLIX.CNFM_YN, 'N') != 'Y' AND PPLIX.KEY_VAL_NM = PPIX.KEY_VAL_NM
                LEFT OUTER JOIN PP_PLANPROCS_INFO_X20329 PPRIX ON PPRIX.COMPANY_CD = PPM.COMPANY_CD AND PPRIX.PLAN_NO = PPM.PLAN_NO AND PPRIX.PLANT_CD = PPM.PLANT_CD
                                                              AND NVL(PPRIX.CNFM_YN, 'N') != 'Y' AND PPRIX.KEY_VAL_NM = PPIX.KEY_VAL_NM
                LEFT OUTER JOIN PP_PLANBBND_INFO_X20329 PPBIX1 ON PPBIX1.COMPANY_CD = PPM.COMPANY_CD AND PPBIX1.PLAN_NO = PPM.PLAN_NO AND PPBIX1.PLANT_CD = PPM.PLANT_CD
                                                              AND (NVL(PPBIX1.LAST_YN, 'N') = 'Y' OR NVL(PPBIX1.SUPP_YN, 'N') = 'Y') AND NVL(PPBIX1.CNFM_YN, 'N') != 'Y'
                LEFT OUTER JOIN PP_PLANBBND_INFO_X20329 PPBIX2 ON PPBIX2.COMPANY_CD = PPM.COMPANY_CD AND PPBIX2.PLAN_NO = PPM.PLAN_NO AND PPBIX2.PLANT_CD = PPM.PLANT_CD
                                                              AND NVL(PPBIX2.LAST_YN, 'N') != 'Y' AND NVL(PPBIX2.SUPP_YN, 'N') != 'Y'
                                                              AND NVL(PPBIX2.CNFM_YN, 'N') != 'Y' AND PPBIX2.KEY_VAL_NM = PPIX.KEY_VAL_NM
                GROUP BY PPM.PLAN_NO
            ), TAB2_PK_CNT AS (
                SELECT PLAN_NO, SUM(PK_CNT) PK_CNT FROM (
                    SELECT PP.PLAN_NO, COUNT(PPDX.PLAN_NO) PK_CNT
                    FROM PP_PLAN_DTL_X20329 PPDX
                    INNER JOIN PP_PLAN PP ON PP.COMPANY_CD = PPDX.COMPANY_CD AND PP.PLAN_NO = PPDX.PLAN_NO AND PP.PLAN_HIS_SQ = PPDX.PLAN_HIS_SQ AND PP.PLANT_CD = PPDX.PLANT_CD
                    INNER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPIX.COMPANY_CD = PPDX.COMPANY_CD AND PPIX.PLANT_CD = PPDX.PLANT_CD AND PPIX.PLAN_NO = PPDX.PLAN_NO AND PPIX.PLAN_HIS_SQ = 1
                    WHERE PPDX.COMPANY_CD = '1000' AND PPDX.PLAN_HIS_SQ = 1 AND PPDX.PLANT_CD = '1000'
                    GROUP BY PP.PLAN_NO
                    UNION ALL
                    SELECT PP.PLAN_NO, COUNT(SOIX.%INFO_NO%) AS PK_CNT
                    FROM %PROCS_TBL% SOIX
                    INNER JOIN SD_ORDER SO ON SO.COMPANY_CD = SOIX.COMPANY_CD AND SO.ORDDOC_NO = SOIX.%INFO_NO% AND SO.PLANT_CD = SOIX.%PROCS_PLANT%
                    INNER JOIN PP_PLAN PP ON PP.COMPANY_CD = SOIX.COMPANY_CD AND PP.ORDDOC_NO = SOIX.%INFO_NO% AND PP.PLANT_CD = SOIX.%PROCS_PLANT%
                    INNER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPIX.COMPANY_CD = SOIX.COMPANY_CD AND PPIX.PLANT_CD = SOIX.%PROCS_PLANT% AND PPIX.ORDDOC_NO = SOIX.%INFO_NO%
                                                          AND PPIX.ORDDOC_SQ = SOIX.%INFO_SQ% AND PPIX.PAGE_SQ = SOIX.%PROCS_PAGE% AND PPIX.LINE_SQ = SOIX.%PROCS_LINE% AND PPIX.PLAN_HIS_SQ = 1
                    WHERE SOIX.COMPANY_CD = '1000' AND SOIX.%PROCS_PLANT% = '1000' AND NVL(SOIX.PLMK_YN, 'N') = 'Y'
                    GROUP BY PP.PLAN_NO
                ) GROUP BY PLAN_NO
            ), TAB3_PK_CNT AS (
                SELECT PP.PLAN_NO, COUNT(PPIX.PLAN_NO) PK_CNT
                FROM %PROCS_TBL% SOIX
                INNER JOIN SD_ORDER SO ON SO.COMPANY_CD = SOIX.COMPANY_CD AND SO.ORDDOC_NO = SOIX.%INFO_NO% AND SO.PLANT_CD = SOIX.%PROCS_PLANT%
                INNER JOIN PP_PLAN PP ON PP.COMPANY_CD = SOIX.COMPANY_CD AND PP.ORDDOC_NO = SOIX.%INFO_NO% AND PP.PLANT_CD = SOIX.%PROCS_PLANT%
                INNER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPIX.COMPANY_CD = SOIX.COMPANY_CD AND PPIX.PLANT_CD = SOIX.%PROCS_PLANT% AND PPIX.ORDDOC_NO = SOIX.%INFO_NO%
                                                      AND PPIX.ORDDOC_SQ = SOIX.%INFO_SQ% AND PPIX.PAGE_SQ = SOIX.%PROCS_PAGE% AND PPIX.LINE_SQ = SOIX.%PROCS_LINE% AND PPIX.PLAN_HIS_SQ = 1
                WHERE SOIX.COMPANY_CD = '1000' AND SOIX.%PROCS_PLANT% = '1000' AND NVL(SOIX.PLMK_YN, 'N') != 'Y'
                GROUP BY PP.PLAN_NO
            ), TAB4_PK_CNT AS (
                SELECT PLAN_NO, SUM(PK_CNT) PK_CNT FROM (
                    SELECT PP.PLAN_NO, COUNT(PPDX.PLAN_NO) PK_CNT
                    FROM PP_PLAN_DTL_X20329 PPDX
                    INNER JOIN PP_PLAN PP ON PP.COMPANY_CD = PPDX.COMPANY_CD AND PP.PLAN_NO = PPDX.PLAN_NO AND PP.PLAN_HIS_SQ = PPDX.PLAN_HIS_SQ AND PP.PLANT_CD = PPDX.PLANT_CD
                    WHERE PPDX.COMPANY_CD = '1000' AND PPDX.PLAN_HIS_SQ = 1 AND PPDX.PLANT_CD = '1000' AND PPDX.PRPL_CD != 'G001'
                    GROUP BY PP.PLAN_NO
                    UNION ALL
                    SELECT PP.PLAN_NO, COUNT(SODX.%INFO_NO%) AS PK_CNT
                    FROM %BBND_TBL% SODX
                    INNER JOIN SD_ORDER SO ON SO.COMPANY_CD = SODX.COMPANY_CD AND SO.ORDDOC_NO = SODX.%INFO_NO% AND SO.PLANT_CD = SODX.%PROCS_PLANT%
                    INNER JOIN PP_PLAN PP ON PP.COMPANY_CD = SODX.COMPANY_CD AND PP.ORDDOC_NO = SODX.%INFO_NO% AND PP.PLANT_CD = SODX.%PROCS_PLANT%
                    INNER JOIN PP_PLAN_DTL_X20329 PPDX ON PPDX.COMPANY_CD = SODX.COMPANY_CD AND PPDX.PLANT_CD = SODX.%PROCS_PLANT% AND PPDX.ORDDOC_NO = SODX.%INFO_NO%
                                                      AND PPDX.ORDDOC_SQ = SODX.%INFO_SQ% AND PPDX.PLAN_HIS_SQ = 1
                    WHERE SODX.COMPANY_CD = '1000' AND SODX.PLANT_CD = '1000'
                    GROUP BY PP.PLAN_NO
                ) GROUP BY PLAN_NO
            ), TAB6_PK_CNT AS (
                SELECT PP.PLAN_NO, COUNT(PPRIX.PLAN_NO) PK_CNT
                FROM PP_PLANPRW_INFO_X20329 PPRIX
                INNER JOIN PP_PLAN PP ON PP.COMPANY_CD = PPRIX.COMPANY_CD AND PP.PLAN_NO = PPRIX.PLAN_NO AND PP.PLAN_HIS_SQ = PPRIX.PLAN_HIS_SQ AND PP.PLANT_CD = PPRIX.PLANT_CD
                WHERE PPRIX.COMPANY_CD = '1000' AND PPRIX.PLANT_CD = '1000' AND PPRIX.OP_CD = 'OP201'
                GROUP BY PP.PLAN_NO
            ), TAB_CNFM_YN AS (
                SELECT PLAN_NO,
                       CASE WHEN PPIX_PLAN_NO_YN = 'N' OR (PPIX_PLAN_NO_YN = 'Y' AND PPIX_CNFM_CNT > 0) THEN 'N' ELSE 'Y' END AS PPIX_CNFM_YN,
                       CASE WHEN (PPLIX_PLAN_NO_YN = 'N' AND PPLIX_PK_CNT > 0) OR (PPLIX_PLAN_NO_YN = 'Y' AND PPLIX_CNFM_CNT > 0) THEN 'N' ELSE 'Y' END AS PPLIX_CNFM_YN,
                       CASE WHEN (PPRIX_PLAN_NO_YN = 'N' AND PPRIX_PK_CNT > 0) OR (PPRIX_PLAN_NO_YN = 'Y' AND PPRIX_CNFM_CNT > 0) THEN 'N' ELSE 'Y' END AS PPRIX_CNFM_YN,
                       CASE WHEN (PPBIX2_PLAN_NO_YN = 'N' AND PPBIX2_PK_CNT > 0) OR (PPBIX2_PLAN_NO_YN = 'Y' AND PPBIX2_CNFM_CNT > 0) THEN 'N' ELSE 'Y' END AS PPBIX2_CNFM_YN,
                       CASE WHEN (PPBIX1_PLAN_NO_YN = 'N' AND PPBIX1_PK_CNT > 0) OR (PPBIX1_PLAN_NO_YN = 'Y' AND PPBIX1_CNFM_CNT > 0) THEN 'N' ELSE 'Y' END AS PPBIX1_CNFM_YN
                FROM (
                    SELECT PP.PLAN_NO,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPIX_PLAN_NO_YN,
                           CASE WHEN PPNY.PPLIX_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPLIX_PLAN_NO_YN,
                           CASE WHEN PPNY.PPRIX_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPRIX_PLAN_NO_YN,
                           CASE WHEN PPNY.PPBIX1_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPBIX1_PLAN_NO_YN,
                           CASE WHEN PPNY.PPBIX2_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPBIX2_PLAN_NO_YN,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(PPCY.PPIX_CNFM_CNT, 0) END AS PPIX_CNFM_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(PPCY.PPLIX_CNFM_CNT, 0) END AS PPLIX_CNFM_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(PPCY.PPRIX_CNFM_CNT, 0) END AS PPRIX_CNFM_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(PPCY.PPBIX1_CNFM_CNT, 0) END AS PPBIX1_CNFM_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(PPCY.PPBIX2_CNFM_CNT, 0) END AS PPBIX2_CNFM_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(TAB2_PK_CNT.PK_CNT, 0) END AS PPLIX_PK_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(TAB3_PK_CNT.PK_CNT, 0) END AS PPRIX_PK_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(TAB4_PK_CNT.PK_CNT, 0) END AS PPBIX1_PK_CNT,
                           CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 0 ELSE NVL(TAB6_PK_CNT.PK_CNT, 0) END AS PPBIX2_PK_CNT
                    FROM PP_PLAN PP
                    LEFT OUTER JOIN PP_PLAN_NO_YN PPNY ON PPNY.PPMX_PLAN_NO = PP.PLAN_NO
                    LEFT OUTER JOIN PP_PLAN_NO_CNFM_YN PPCY ON PPCY.PPMX_PLAN_NO = PP.PLAN_NO
                    LEFT OUTER JOIN TAB2_PK_CNT ON TAB2_PK_CNT.PLAN_NO = PP.PLAN_NO
                    LEFT OUTER JOIN TAB3_PK_CNT ON TAB3_PK_CNT.PLAN_NO = PP.PLAN_NO
                    LEFT OUTER JOIN TAB4_PK_CNT ON TAB4_PK_CNT.PLAN_NO = PP.PLAN_NO
                    LEFT OUTER JOIN TAB6_PK_CNT ON TAB6_PK_CNT.PLAN_NO = PP.PLAN_NO
                )
            )
            SELECT SO.COMPANY_CD, SO.PLANT_CD,
                   NVL2(PP.ORDDOC_NO, PP.ORDDOC_NO, SO.ORDDOC_NO) AS ORDDOC_NO, SO.ORDDOC_NM,
                   NVL2(PP.ORDDOC_NO, PP.ORD_DT, SO.ORD_DT) AS ORD_DT,
                   PP.PLAN_NO, NVL(PP.PLAN_HIS_SQ, 1) AS PLAN_HIS_SQ,
                   NVL(PP.PLAN_FG_CD, '%PLAN_FG%') AS PLAN_FG_CD, MC.SYSDEF_NM AS PLAN_FG_NM,
                   NVL2(PP.ORDDOC_NO, PP.DEPT_CD, SO.DEPT_CD) AS DEPT_CD, NVL2(PP.ORDDOC_NO, MDM2.DEPT_NM, MDM.DEPT_NM) AS DEPT_NM,
                   SO.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS BIZRSPT_EMPNO_NM,
                   NVL2(PP.ORDDOC_NO, PP.PARTNER_CD, SO.PARTNER_CD) AS PARTNER_CD, NVL2(PP.ORDDOC_NO, CPM2.PARTNER_NM, CPM.PARTNER_NM) AS PARTNER_NM,
                   CASE WHEN PP.PLAN_NO IS NULL THEN '미작성'
                        WHEN TCY.PPIX_CNFM_YN = 'Y' AND TCY.PPLIX_CNFM_YN = 'Y' AND TCY.PPRIX_CNFM_YN = 'Y' AND TCY.PPBIX2_CNFM_YN = 'Y' AND TCY.PPBIX1_CNFM_YN = 'Y' THEN '작성 완료'
                        ELSE '작성중' END AS PLAN_ST_NM,
                   PP.RMK_TXT, SO.WRK_FG, SO.WRK_FG_NM, SO.CNFM_DTS,
                   CASE WHEN PPNY.PPIX_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPIX_PLAN_NO_YN,
                   CASE WHEN PPNY.PPLIX_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPLIX_PLAN_NO_YN,
                   CASE WHEN PPNY.PPRIX_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPRIX_PLAN_NO_YN,
                   CASE WHEN PPNY.PPBIX1_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPBIX1_PLAN_NO_YN,
                   CASE WHEN PPNY.PPBIX2_PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPBIX2_PLAN_NO_YN,
                   TCY.PPIX_CNFM_YN, TCY.PPLIX_CNFM_YN, TCY.PPRIX_CNFM_YN, TCY.PPBIX1_CNFM_YN, TCY.PPBIX2_CNFM_YN,
                   RTRIM(CASE WHEN TCY.PPIX_CNFM_YN = 'N' THEN ' 인쇄,' END || CASE WHEN TCY.PPLIX_CNFM_YN = 'N' THEN ' 제판,' END ||
                         CASE WHEN TCY.PPRIX_CNFM_YN = 'N' THEN ' 후가공,' END || CASE WHEN TCY.PPBIX2_CNFM_YN = 'N' THEN ' 접지,' END ||
                         CASE WHEN TCY.PPBIX1_CNFM_YN = 'N' THEN ' 제본' END, ',') AS CNFM_N_LIST,
                   ROW_NUMBER() OVER (ORDER BY SO.CNFM_DTS DESC, SO.ORDDOC_NO DESC, PP.PLAN_NO, PP.PLAN_HIS_SQ) AS SQ_NUM
            FROM SD_ORDER SO
            LEFT OUTER JOIN PP_PLAN PP ON SO.COMPANY_CD = PP.COMPANY_CD AND SO.ORDDOC_NO = PP.ORDDOC_NO AND SO.PLANT_CD = PP.PLANT_CD
            LEFT OUTER JOIN PP_PLAN_NO_YN PPNY ON PPNY.PPMX_PLAN_NO = PP.PLAN_NO
            LEFT OUTER JOIN TAB_CNFM_YN TCY ON TCY.PLAN_NO = PP.PLAN_NO
            LEFT OUTER JOIN MA_CODEDTL MC ON MC.COMPANY_CD = SO.COMPANY_CD AND MC.MODULE_CD = 'PP' AND MC.FIELD_CD = 'Z003_20329' AND MC.SYSDEF_CD = NVL(PP.PLAN_FG_CD, '%PLAN_FG%')
            LEFT OUTER JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = SO.COMPANY_CD AND MDM.DEPT_CD = SO.DEPT_CD
            LEFT OUTER JOIN MA_DEPT_MST MDM2 ON MDM2.COMPANY_CD = SO.COMPANY_CD AND MDM2.DEPT_CD = PP.DEPT_CD
            LEFT OUTER JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = SO.PARTNER_CD
            LEFT OUTER JOIN CI_PARTNER_MST CPM2 ON CPM2.PARTNER_CD = PP.PARTNER_CD
            LEFT OUTER JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = SO.COMPANY_CD AND HEM.EMP_NO = SO.BIZRSPT_EMPNO_CD
            ORDER BY SQ_NUM
            """
                .replace("%INFO_TBL%", infoTbl).replace("%INFO_NO%", infoNo).replace("%INFO_SQ%", infoSq)
                .replace("%PROCS_TBL%", procsTbl).replace("%PROCS_PAGE%", procsPage).replace("%PROCS_LINE%", procsLine).replace("%PROCS_PLANT%", procsPlant)
                .replace("%BBND_TBL%", bbndTbl).replace("%PLAN_FG%", planFgDefault);
    }

    private static final String ORDER_LIST_SQL = listSql(false);
    private static final String REQUEST_LIST_SQL = listSql(true);

    // ───────────────────────────── 주문상세 ─────────────────────────────
    /**
     * 주문상세 — 주문 라인마다 계획(PP_PLAN_DTL)이 있으면 계획값, 없으면 주문값(NVL2). PLAN_SQ 가 탭 행과 잇는 키.
     * 작업지시서용으로 포장방법(Z006)·포장수량·공정별특이사항(RMK_TXT)·주문상태를 더했다. 계획의 PACK_MTHD_TXT 는 비어 있어 주문의 코드값을 쓴다.
     */
    private static String detailSql(boolean request) {
        // 의뢰(PP_PREORD_DTL)는 주문(SD_ORDER_DTL)과 컬럼이 같고 키 이름(PLAN_ORD_NO/SQ, PLANT_CD)만 다르다.
        String tbl = request ? "PP_PREORD_DTL_X20329" : "SD_ORDER_DTL_X20329";
        String no = request ? "PLAN_ORD_NO" : "ORDDOC_NO";
        String sq = request ? "PLAN_ORD_SQ" : "ORDDOC_SQ";
        String plant = request ? "PLANT_CD" : "PLAN_PLANT_CD";
        return ("""
            SELECT SODX.COMPANY_CD, SODX.%PLANT% AS PLANT_CD, PPDX.PLAN_NO, NVL(PPDX.PLAN_HIS_SQ, 1) AS PLAN_HIS_SQ,
                   NVL2(PPDX.ORDDOC_NO, PPDX.PLAN_SQ, SODX.%SQ%) AS PLAN_SQ,
                   SODX.%NO% AS ORDDOC_NO, SODX.%SQ% AS ORDDOC_SQ, SODX.ORDDOC_ST,
                   NVL2(PPDX.ORDDOC_NO, PPDX.ITEM_CD, SODX.ITEM_CD) AS ITEM_CD,
                   NVL2(PPDX.ORDDOC_NO, PPDX.ITEM_NM, SODX.ITEM_NM) AS ITEM_NM,
                   NVL2(PPDX.ORDDOC_NO, PPDX.ITEM_FG, SODX.ITEM_FG) AS ITEM_FG,
                   NVL2(PPDX.ORDDOC_NO, PPDX.HRZN_QT, SODX.HRZN_QT) AS HRZN_QT,
                   NVL2(PPDX.ORDDOC_NO, PPDX.VTCL_QT, SODX.VTCL_QT) AS VTCL_QT,
                   NVL2(PPDX.ORDDOC_NO, PPDX.HGH_QT, SODX.HGH_QT) AS HGH_QT,
                   NVL2(PPDX.ORDDOC_NO, PPDX.ORD_UNIT_CD, CI.STD_UNIT_CD) AS ORD_UNIT_CD,
                   NVL2(PPDX.ORDDOC_NO, PPDX.ORD_QT, SODX.ORD_QT) AS ORD_QT,
                   NVL2(PPDX.ORDDOC_NO, PPDX.BBND_INFO_CD, SODX.BBND_INFO_CD) AS BBND_INFO_CD,
                   NVL2(PPDX.ORDDOC_NO, MC3.SYSDEF_NM, MC1.SYSDEF_NM) AS BBND_INFO_NM,
                   TO_CHAR(NVL2(PPDX.ORDDOC_NO, PPDX.RCPT_PRRG_DTS, SODX.RCPT_PRRG_DTS), 'YYYYMMDD') AS RCPT_PRRG_DTS,
                   TO_CHAR(NVL2(PPDX.ORDDOC_NO, PPDX.RCPT_PRRG_DTS, SODX.RCPT_PRRG_DTS), 'HH24MI') AS RCPT_PRRG_DTS2,
                   TO_CHAR(NVL2(PPDX.ORDDOC_NO, PPDX.DLVSH_DTS, SODX.DLVSH_DTS), 'YYYYMMDD') AS DLVSH_DTS,
                   TO_CHAR(NVL2(PPDX.ORDDOC_NO, PPDX.DLVSH_DTS, SODX.DLVSH_DTS), 'HH24MI') AS DLVSH_DTS2,
                   NVL2(PPDX.ORDDOC_NO, PPDX.CUST_SAMP_CPS, SODX.CUST_SAMP_CPS) AS CUST_SAMP_CPS,
                   NVL2(PPDX.ORDDOC_NO, PPDX.CUST_SAMP_CPS2, SODX.CUST_SAMP_CPS2) AS CUST_SAMP_CPS2,
                   NVL2(PPDX.ORDDOC_NO, PPDX.PRPL_CD, SODX.PRPL_CD) AS PRPL_CD,
                   NVL2(PPDX.ORDDOC_NO, MC4.SYSDEF_NM, MC2.SYSDEF_NM) AS PRPL_NM,
                   NVL2(PPDX.ORDDOC_NO, PPDX.CLO_CPS, SODX.CLO_CPS) AS CLO_CPS,
                   NVL2(PPDX.ORDDOC_NO, PPDX.SPCFCS_ITEM_NM, SODX.SPCFCS_ITEM_NM) AS SPCFCS_ITEM_NM,
                   SODX.PACK_MTHD_CD, MC5.SYSDEF_NM AS PACK_MTHD_NM,
                   NVL2(PPDX.ORDDOC_NO, NVL(PPDX.PACK_UNIT_DC, SODX.PACK_UNIT_DC), SODX.PACK_UNIT_DC) AS PACK_UNIT_DC,
                   SODX.RMK_TXT
            FROM %TBL% SODX
            LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON PPDX.COMPANY_CD = SODX.COMPANY_CD AND PPDX.PLANT_CD = SODX.%PLANT%
                                                   AND PPDX.PLAN_NO = :planNo AND PPDX.PLAN_HIS_SQ = 1
                                                   AND PPDX.ORDDOC_NO = SODX.%NO% AND PPDX.ORDDOC_SQ = SODX.%SQ%
            LEFT OUTER JOIN CI_ITEM CI ON CI.ITEM_CD = SODX.ITEM_CD
            """
            + code("MC1", "SD", "Z010_20329", "SODX.BBND_INFO_CD")
            + code("MC2", "SD", "Z003_20329", "SODX.PRPL_CD")
            + code("MC3", "SD", "Z010_20329", "PPDX.BBND_INFO_CD")
            + code("MC4", "SD", "Z003_20329", "PPDX.PRPL_CD")
            + code("MC5", "SD", "Z006_20329", "SODX.PACK_MTHD_CD") + """
            WHERE SODX.COMPANY_CD = '1000' AND SODX.%PLANT% = '1000' AND SODX.%NO% = :orderNo
            ORDER BY CASE WHEN PPDX.ORDDOC_NO IS NULL THEN SODX.%SQ% END, PPDX.PLAN_NO, PPDX.PLAN_SQ
            """).replace("%TBL%", tbl).replace("%NO%", no).replace("%SQ%", sq).replace("%PLANT%", plant);
    }

    private static final String ORDER_DETAIL_SQL = detailSql(false);
    private static final String REQUEST_DETAIL_SQL = detailSql(true);

    // ───────────────────────────── 인쇄 탭 ─────────────────────────────
    /**
     * 인쇄 — PP_PLANPRW_INFO. 생산계획현황 인쇄 탭과 같은 뼈대에 등록 화면만의 컬럼이 더 있다:
     * 용지발주 PO_CNCL_YN(구매지 100 → 발주서, 재고지 200 → 자재예약), 구매요청 건수 REQN_CNT, 별색 잉크 품목(앞/뒤, "○○ 외 n"),
     * 후가공정보 PROCS_NM(후가공 계획이 있으면 계획, 없으면 주문 사양), 확정(인쇄 CNFM_YN·제판 CNFM_YN2), 대수마감, 재단횟수.
     */
    private static final String PRINT_SQL = """
            SELECT PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.ORDDOC_NO, PPIX.ORDDOC_SQ, PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ,
                   PPIX.PAGE_SQ, PPIX.LINE_SQ, PPIX.SORT_SQ,
                   PPIX.ITEM_CD, PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM, PPIX.CONFIG_CD, MC2.SYSDEF_NM AS CONFIG_NM,
                   CASE WHEN MIX.PPR_FG_CD = '100' AND PPSX.PURDOC_NO IS NOT NULL THEN 'Y'
                        WHEN MIX.PPR_FG_CD = '100' AND PPSX.PURDOC_NO IS NULL THEN 'N'
                        WHEN MIX.PPR_FG_CD = '200' AND IMSX.INVTRX_RSV_NO IS NOT NULL THEN 'Y'
                        WHEN MIX.PPR_FG_CD = '200' AND IMSX.INVTRX_RSV_NO IS NULL THEN 'N'
                        ELSE 'N' END AS PO_CNCL_YN,
                   PPIX.PLAN_DT, PPIX.OP_CD, MC4.SYSDEF_NM AS OP_NM, PPIX.INTLTSH_CD, MC3.SYSDEF_NM AS INTLTSH_NM, PPIX.WRK_CD, MC5.SYSDEF_NM AS WRK_NM,
                   PPIX.PRPCNT_SQ, PPIX.START_PAGE_CNT, PPIX.END_PAGE_CNT, PPIX.EQP_CD, PES.EQP_NM,
                   CASE WHEN MEI.INOUTCOM_FG = '03' AND MC5.FLAG_CD = 'N' THEN NULL ELSE PPIX.MTRIL_CD END AS MTRIL_CD,
                   CASE WHEN MEI.INOUTCOM_FG = '03' AND MC5.FLAG_CD = 'N' THEN NULL ELSE CI2.ITEM_NM END AS MTRIL_NM,
                   MEI.INOUTCOM_FG, PPIX.STD_UNIT_CD, PPIX.DTL_SIZE_DC,
                   DECODE(PPLIX.PLAN_NO, NULL, PPIX.PLMK_CD, PPLIX.WRK_CD) AS PLMK_CD,
                   DECODE(PPLIX.PLAN_NO, NULL, MC7.SYSDEF_NM, MC8.SYSDEF_NM) AS PLMK_NM,
                   PPIX.PGS, PPIX.DTL_DC, PPIX.PPR_DIVD_QT,
                   PPIX.GNRL_PRW_BEF_QT, PPIX.GNRL_PRW_AFTR_QT, PPIX.SPCLR_PRW_BEF_QT,
                   CASE WHEN PPIIXF1.NO_SQ_CNT > 1 THEN CI3.ITEM_NM || ' 외 ' || TO_CHAR(PPIIXF1.NO_SQ_CNT - 1) ELSE CI3.ITEM_NM END AS ITEM_CD_FRONT,
                   PPIX.SPCLR_PRW_AFTR_QT,
                   CASE WHEN PPIIXB1.NO_SQ_CNT > 1 THEN CI4.ITEM_NM || ' 외 ' || TO_CHAR(PPIIXB1.NO_SQ_CNT - 1) ELSE CI4.ITEM_NM END AS ITEM_CD_BACK,
                   PPIX.PLTE_CNT_SUM_QT, PPIX.NET_QT, PPIX.SPRE_QT, PPIX.FULL_QT, PPIX.NET_PPCNT_QT, PPIX.SPRE_PPCNT_QT, PPIX.FULL_PPCNT_QT, PPIX.TONG_CNT,
                   PPIX.ORD_UNIT_CD, PPIX.ORD_QT,
                   NVL2(PPRIX.PLAN_NO, PPRIX.PAGE_NM, SOPIX.PROCS_NM) AS PROCS_NM,
                   PPIX.RMK_TXT, PPIX.ADJT_QT, PPIX.ADJT_PPCNT_QT, PPIX.ADJT_PPCNT_SUM_QT,
                   NVL(PPIX.CNFM_YN, 'N') AS CNFM_YN, NVL(PPLIX.CNFM_YN, 'N') AS CNFM_YN2,
                   PPIX.GRPG_YN, PPIX.GRP_YN, PPIX.GRP_SQ, PPIX.VNR_NET_QT, PPIX.VNR_SPRE_QT, PPIX.VNR_ADJT_QT, PPIX.STD_UNIT_TOT_QT,
                   PPIX.TOP_ORGN_CD, NVL(PPIX.WRK_TM_CNT, 0) AS WRK_TM_CNT, PPIX.KEY_VAL_NM,
                   ROW_NUMBER() OVER (PARTITION BY PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ ORDER BY PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.PAGE_SQ, PPIX.LINE_SQ) AS RN,
                   MIX.PPR_FG_CD, NVL(PPD.REQN_CNT, 0) AS REQN_CNT, NVL(PPIX.PRPCNT_CLOSE_YN, 'N') AS PRPCNT_CLOSE_YN,
                   CASE WHEN PPRIX.PLAN_NO IS NULL THEN 'N' ELSE 'Y' END AS PPRIX_PLAN_NO_YN, NVL(PPIX.DIVD_CNT, 1) AS DIVD_CNT
            FROM PP_PLANPRW_INFO_X20329 PPIX
            LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON PPDX.COMPANY_CD = PPIX.COMPANY_CD AND PPDX.PLANT_CD = PPIX.PLANT_CD AND PPDX.PLAN_NO = PPIX.PLAN_NO
                                                   AND PPDX.PLAN_HIS_SQ = PPIX.PLAN_HIS_SQ AND PPDX.PLAN_SQ = PPIX.PLAN_SQ
            LEFT OUTER JOIN PP_OPSTDPRI_INFO_X20329 POIX ON POIX.COMPANY_CD = PPIX.COMPANY_CD AND POIX.PLANT_CD = PPIX.PLANT_CD AND POIX.WRK_CD = PPIX.WRK_CD
                                                        AND NVL(POIX.USE_YN, 'N') = 'Y' AND NVL(POIX.PARTNER_CD_USE_YN, 'N') = 'N'
            LEFT OUTER JOIN PP_PLANPLMK_INFO_X20329 PPLIX ON PPLIX.COMPANY_CD = PPIX.COMPANY_CD AND PPLIX.PLANT_CD = PPIX.PLANT_CD
                                                         AND PPLIX.KEY_VAL_NM = PPIX.KEY_VAL_NM AND NVL(PPLIX.SUPP_YN, 'N') != 'Y'
            LEFT OUTER JOIN (SELECT PLAN_NO, PLAN_SQ, PLAN_LOW_SQ, ORDDOC_NO, DRC_FG, MIN(NO_SQ) NO_SQ, COUNT(NO_SQ) NO_SQ_CNT
                             FROM PP_PLANINK_INFO_X20329
                             WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND PLAN_NO = :planNo AND PLAN_HIS_SQ = 1 AND DRC_FG = 'F'
                             GROUP BY PLAN_NO, PLAN_SQ, PLAN_LOW_SQ, ORDDOC_NO, DRC_FG) PPIIXF1
                         ON PPIIXF1.PLAN_NO = PPIX.PLAN_NO AND PPIIXF1.PLAN_SQ = PPIX.PLAN_SQ AND PPIIXF1.PLAN_LOW_SQ = PPIX.PLAN_LOW_SQ AND PPIIXF1.ORDDOC_NO = PPIX.ORDDOC_NO
            LEFT OUTER JOIN PP_PLANINK_INFO_X20329 PPIIXF2 ON PPIIXF2.COMPANY_CD = PPIX.COMPANY_CD AND PPIIXF2.PLANT_CD = PPIX.PLANT_CD AND PPIIXF2.PLAN_NO = PPIX.PLAN_NO
                                                          AND PPIIXF2.PLAN_HIS_SQ = PPIX.PLAN_HIS_SQ AND PPIIXF2.PLAN_SQ = PPIX.PLAN_SQ AND PPIIXF2.PLAN_LOW_SQ = PPIX.PLAN_LOW_SQ
                                                          AND PPIIXF2.ORDDOC_NO = PPIX.ORDDOC_NO AND PPIIXF2.DRC_FG = PPIIXF1.DRC_FG AND PPIIXF2.NO_SQ = PPIIXF1.NO_SQ
            LEFT OUTER JOIN (SELECT PLAN_NO, PLAN_SQ, PLAN_LOW_SQ, ORDDOC_NO, DRC_FG, MIN(NO_SQ) NO_SQ, COUNT(NO_SQ) NO_SQ_CNT
                             FROM PP_PLANINK_INFO_X20329
                             WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND PLAN_NO = :planNo AND PLAN_HIS_SQ = 1 AND DRC_FG = 'B'
                             GROUP BY PLAN_NO, PLAN_SQ, PLAN_LOW_SQ, ORDDOC_NO, DRC_FG) PPIIXB1
                         ON PPIIXB1.PLAN_NO = PPIX.PLAN_NO AND PPIIXB1.PLAN_SQ = PPIX.PLAN_SQ AND PPIIXB1.PLAN_LOW_SQ = PPIX.PLAN_LOW_SQ AND PPIIXB1.ORDDOC_NO = PPIX.ORDDOC_NO
            LEFT OUTER JOIN PP_PLANINK_INFO_X20329 PPIIXB2 ON PPIIXB2.COMPANY_CD = PPIX.COMPANY_CD AND PPIIXB2.PLANT_CD = PPIX.PLANT_CD AND PPIIXB2.PLAN_NO = PPIX.PLAN_NO
                                                          AND PPIIXB2.PLAN_HIS_SQ = PPIX.PLAN_HIS_SQ AND PPIIXB2.PLAN_SQ = PPIX.PLAN_SQ AND PPIIXB2.PLAN_LOW_SQ = PPIX.PLAN_LOW_SQ
                                                          AND PPIIXB2.ORDDOC_NO = PPIX.ORDDOC_NO AND PPIIXB2.DRC_FG = PPIIXB1.DRC_FG AND PPIIXB2.NO_SQ = PPIIXB1.NO_SQ
            LEFT OUTER JOIN (SELECT PPSX.PLAN_NO, PPSX.PLAN_SQ, PPSX.PLAN_LOW_SQ, COUNT(PPD.PURREQ_NO) AS REQN_CNT
                             FROM PU_PURREQ_DTL PPD
                             INNER JOIN PU_PURREQ_SDTL_X20329 PPSX ON PPSX.COMPANY_CD = PPD.COMPANY_CD AND PPSX.PURREQ_NO = PPD.PURREQ_NO
                                                                  AND PPSX.PURREQ_SQ = PPD.PURREQ_SQ AND PPSX.PLAN_NO = :planNo
                             WHERE PPD.COMPANY_CD = '1000' AND PPD.PLANT_CD = '1000' AND NVL(PPD.REQN_CNCL_YN, 'N') = 'N'
                             GROUP BY PPSX.PLAN_NO, PPSX.PLAN_SQ, PPSX.PLAN_LOW_SQ) PPD
                         ON PPD.PLAN_NO = PPIX.PLAN_NO AND PPD.PLAN_SQ = PPIX.PLAN_SQ AND PPD.PLAN_LOW_SQ = PPIX.PLAN_LOW_SQ
            LEFT OUTER JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = PPIX.COMPANY_CD AND PES.EQP_CD = PPIX.EQP_CD AND PES.LANG_CD = 'KO'
            LEFT OUTER JOIN ME_EQPCAPA_INFO MEI ON MEI.COMPANY_CD = PPIX.COMPANY_CD AND MEI.PLANT_CD = PPIX.PLANT_CD AND MEI.EQP_CD = PPIX.EQP_CD
            LEFT OUTER JOIN (SELECT PPSX.COMPANY_CD, PPSX.PLAN_NO, PPSX.PLAN_SQ, PPSX.PLAN_LOW_SQ, MAX(PPD.PURDOC_NO) AS PURDOC_NO
                             FROM PU_PURORDER_SDTL_X20329 PPSX
                             INNER JOIN PU_PURORDERDLV_DTL PPD ON PPD.COMPANY_CD = PPSX.COMPANY_CD AND PPD.PURDOC_NO = PPSX.PURDOC_NO
                                                              AND PPD.PURDOC_SQ = PPSX.PURDOC_SQ AND NVL(PPD.PO_CNCL_YN, 'N') = 'N'
                             WHERE PPSX.COMPANY_CD = '1000' AND PPSX.PLAN_NO = :planNo
                             GROUP BY PPSX.COMPANY_CD, PPSX.PLAN_NO, PPSX.PLAN_SQ, PPSX.PLAN_LOW_SQ) PPSX
                         ON PPSX.COMPANY_CD = PPIX.COMPANY_CD AND PPSX.PLAN_NO = PPIX.PLAN_NO AND PPSX.PLAN_SQ = PPIX.PLAN_SQ AND PPSX.PLAN_LOW_SQ = PPIX.PLAN_LOW_SQ
            LEFT OUTER JOIN (SELECT IMSX.COMPANY_CD, IMSX.PLAN_NO, IMSX.PLAN_SQ, IMSX.PLAN_LOW_SQ, MAX(IMD.INVTRX_RSV_NO) AS INVTRX_RSV_NO
                             FROM IM_MTLRSV_SDTL_X20329 IMSX
                             INNER JOIN IM_MTLRSV_DTL IMD ON IMD.COMPANY_CD = IMSX.COMPANY_CD AND IMD.INVTRX_RSV_NO = IMSX.INVTRX_RSV_NO
                                                         AND IMD.INVTRX_RSV_SQ = IMSX.INVTRX_RSV_SQ AND NVL(IMD.CNCL_YN, 'N') = 'N'
                             WHERE IMSX.COMPANY_CD = '1000' AND IMSX.PLAN_NO = :planNo
                             GROUP BY IMSX.COMPANY_CD, IMSX.PLAN_NO, IMSX.PLAN_SQ, IMSX.PLAN_LOW_SQ) IMSX
                         ON IMSX.COMPANY_CD = PPIX.COMPANY_CD AND IMSX.PLAN_NO = PPIX.PLAN_NO AND IMSX.PLAN_SQ = PPIX.PLAN_SQ AND IMSX.PLAN_LOW_SQ = PPIX.PLAN_LOW_SQ
            LEFT OUTER JOIN (SELECT COMPANY_CD, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ,
                                    LISTAGG(PROCS_NM, '-') WITHIN GROUP (ORDER BY ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ, PROCS_CD) AS PROCS_NM
                             FROM (SELECT SOIX.COMPANY_CD, SOIX.ORDDOC_NO, SOIX.ORDDOC_SQ, SOIX.PAGE_SQ, SOIX.LINE_SQ, SOIX.PROCS_CD,
                                          MC.SYSDEF_NM || '(' || SOIX.START_PAGE_CNT || ' ~ ' || SOIX.END_PAGE_CNT || ')' AS PROCS_NM
                                   FROM SD_ORDPROCS_INFO_X20329 SOIX
                                   LEFT OUTER JOIN MA_CODEDTL MC ON MC.COMPANY_CD = SOIX.COMPANY_CD AND MC.MODULE_CD = 'SD' AND MC.FIELD_CD = 'Z010_20329' AND MC.SYSDEF_CD = SOIX.PROCS_CD
                                   WHERE SOIX.COMPANY_CD = '1000' AND SOIX.PLAN_PLANT_CD = '1000' AND SOIX.ORDDOC_NO = :orderNo AND NVL(SOIX.PLMK_YN, 'N') != 'Y')
                             GROUP BY COMPANY_CD, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ) SOPIX
                         ON SOPIX.COMPANY_CD = PPIX.COMPANY_CD AND SOPIX.ORDDOC_NO = PPIX.ORDDOC_NO AND SOPIX.ORDDOC_SQ = PPIX.ORDDOC_SQ
                        AND SOPIX.PAGE_SQ = PPIX.PAGE_SQ AND SOPIX.LINE_SQ = PPIX.LINE_SQ
            LEFT OUTER JOIN (SELECT PLAN_NO, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ,
                                    LISTAGG(PAGE_NM, '-') WITHIN GROUP (ORDER BY PLAN_NO, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ) AS PAGE_NM
                             FROM (SELECT PPRIX.PLAN_NO, PPRIX.ORDDOC_NO, PPRIX.ORDDOC_SQ, PPRIX.PAGE_SQ, PPRIX.LINE_SQ,
                                          MC.SYSDEF_NM || '(' || PPRIX.START_PAGE_CNT || ' ~ ' || PPRIX.END_PAGE_CNT || ')' AS PAGE_NM
                                   FROM PP_PLANPROCS_INFO_X20329 PPRIX
                                   LEFT OUTER JOIN MA_CODEDTL MC ON MC.COMPANY_CD = PPRIX.COMPANY_CD AND MC.MODULE_CD = 'SD' AND MC.FIELD_CD = 'Z010_20329' AND MC.SYSDEF_CD = PPRIX.WRK_CD
                                   WHERE PPRIX.COMPANY_CD = '1000' AND PPRIX.PLANT_CD = '1000' AND PPRIX.PLAN_NO = :planNo AND PPRIX.PLAN_HIS_SQ = 1)
                             GROUP BY PLAN_NO, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ) PPRIX
                         ON PPRIX.PLAN_NO = PPIX.PLAN_NO AND PPRIX.ORDDOC_NO = PPIX.ORDDOC_NO AND PPRIX.ORDDOC_SQ = PPIX.ORDDOC_SQ
                        AND PPRIX.PAGE_SQ = PPIX.PAGE_SQ AND PPRIX.LINE_SQ = PPIX.LINE_SQ
            """
            + code("MC2", "SD", "Z007_20329", "PPIX.CONFIG_CD")
            + code("MC3", "PP", "Z002_20329", "PPIX.INTLTSH_CD")
            + code("MC4", "PP", "Z005_20329", "POIX.UP_ORGN_CD")
            + code("MC5", "SD", "Z010_20329", "PPIX.WRK_CD")
            + code("MC7", "SD", "Z010_20329", "PPIX.PLMK_CD")
            + code("MC8", "SD", "Z010_20329", "PPLIX.WRK_CD") + """
            LEFT OUTER JOIN CI_ITEM CI2 ON CI2.ITEM_CD = PPIX.MTRIL_CD
            LEFT OUTER JOIN CI_ITEM CI3 ON CI3.ITEM_CD = PPIIXF2.ITEM_CD
            LEFT OUTER JOIN CI_ITEM CI4 ON CI4.ITEM_CD = PPIIXB2.ITEM_CD
            LEFT OUTER JOIN MA_ITEM_X20329 MIX ON MIX.COMPANY_CD = PPIX.COMPANY_CD AND MIX.ITEM_CD = PPIX.MTRIL_CD
            WHERE PPIX.COMPANY_CD = '1000' AND PPIX.PLANT_CD = '1000' AND PPIX.PLAN_NO = :planNo AND PPIX.PLAN_HIS_SQ = 1
            ORDER BY PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.PAGE_SQ, PPIX.LINE_SQ
            """;

    // ───────────────────────────── 제판 탭 ─────────────────────────────
    /** 제판 — PP_PLANPLMK_INFO. 용지·터잡기·도수는 같은 KEY_VAL_NM 의 인쇄 행에서. */
    private static final String PLATE_SQL = """
            SELECT PPLIX.COMPANY_CD, PPLIX.PLANT_CD, PPLIX.PLAN_NO, PPLIX.PLAN_HIS_SQ, PPLIX.PLAN_SQ, PPLIX.PLAN_LOW_SQ,
                   PPLIX.ORDDOC_NO, PPLIX.ORDDOC_SQ, PPLIX.PAGE_SQ, PPLIX.LINE_SQ, PPLIX.ORD_QT, PPLIX.ORD_UNIT_CD,
                   PPLIX.ITEM_CD, PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM, PPLIX.CONFIG_CD, MC.SYSDEF_NM AS CONFIG_NM,
                   PPLIX.OP_CD, MC2.SYSDEF_NM AS OP_NM, PPLIX.INTLTSH_CD, MC3.SYSDEF_NM AS INTLTSH_NM, PPLIX.WRK_CD, MC4.SYSDEF_NM AS WRK_NM,
                   PPLIX.PRPCNT_SQ, PPLIX.START_PAGE_CNT, PPLIX.END_PAGE_CNT, PPLIX.EQP_CD, PES.EQP_NM, PPLIX.PLAN_DT, PPLIX.WRK_TM_CNT,
                   PPIX.MTRIL_CD, CI.ITEM_NM AS MTRIL_NM, PPIX.DTL_SIZE_DC, PPLIX.PGS, PPIX.DTL_DC, PPLIX.PPR_DIVD_QT,
                   PPLIX.GNRL_PRW_BEF_QT, PPLIX.GNRL_PRW_AFTR_QT, PPLIX.SPCLR_PRW_BEF_QT, PPLIX.SPCLR_PRW_AFTR_QT, PPLIX.PLTE_CNT_SUM_QT,
                   PPLIX.RMK_TXT, NVL(PPLIX.CNFM_YN, 'N') AS CNFM_YN, PPIX.GRPG_YN, PPIX.GRP_YN, PPIX.GRP_SQ,
                   NVL(PPLIX.ISSUE_YN, 'N') AS ISSUE_YN, PPLIX.KEY_VAL_NM, PPLIX.SUPP_YN, PPLIX.TOP_ORGN_CD
            FROM PP_PLANPLMK_INFO_X20329 PPLIX
            INNER JOIN PP_PLAN_DTL_X20329 PPDX ON PPDX.COMPANY_CD = PPLIX.COMPANY_CD AND PPDX.PLANT_CD = PPLIX.PLANT_CD AND PPDX.PLAN_NO = PPLIX.PLAN_NO
                                              AND PPDX.PLAN_HIS_SQ = PPLIX.PLAN_HIS_SQ AND PPDX.PLAN_SQ = PPLIX.PLAN_SQ
            LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPLIX.COMPANY_CD = PPIX.COMPANY_CD AND PPLIX.PLANT_CD = PPIX.PLANT_CD AND PPLIX.KEY_VAL_NM = PPIX.KEY_VAL_NM
            LEFT OUTER JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = PPLIX.COMPANY_CD AND PES.EQP_CD = PPLIX.EQP_CD AND PES.LANG_CD = 'KO'
            LEFT OUTER JOIN CI_ITEM CI ON CI.ITEM_CD = PPIX.MTRIL_CD
            """
            + code("MC", "SD", "Z007_20329", "PPLIX.CONFIG_CD")
            + code("MC2", "PP", "Z005_20329", "PPLIX.OP_CD")
            + code("MC3", "PP", "Z002_20329", "PPLIX.INTLTSH_CD")
            + code("MC4", "SD", "Z010_20329", "PPLIX.WRK_CD") + """
            WHERE PPLIX.COMPANY_CD = '1000' AND PPLIX.PLANT_CD = '1000' AND PPLIX.PLAN_NO = :planNo AND PPLIX.PLAN_HIS_SQ = 1
            ORDER BY PPLIX.PLAN_HIS_SQ, PPLIX.PLAN_SQ, PPLIX.PLAN_LOW_SQ
            """;

    // ───────────────────────────── 후가공 탭 ─────────────────────────────
    /**
     * 후가공 — 저장본 PP_PLANPROCS_INFO. 정본 등록 화면 쿼리는 주문 후가공 사양(SD_ORDPROCS_INFO)으로 초기 행을 만드는 것이라 쓰지 않는다.
     * 재단규격·면수·터잡기·절수는 자기 값이 비면 같은 KEY_VAL_NM 의 인쇄 행 값으로.
     */
    private static final String PROCESS_SQL = """
            SELECT M.COMPANY_CD, M.PLANT_CD, M.PLAN_NO, M.PLAN_HIS_SQ, M.PLAN_SQ, M.PLAN_LOW_SQ,
                   M.ORDDOC_NO, M.ORDDOC_SQ, M.ORD_QT, M.ORD_UNIT_CD, M.PAGE_SQ, M.LINE_SQ, M.PROCS_SQ, M.PRPCNT_SQ,
                   M.ITEM_CD, PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM, M.CONFIG_CD, MC4.SYSDEF_NM AS CONFIG_NM,
                   M.OP_CD, MC.SYSDEF_NM AS OP_NM, M.INTLTSH_CD, MC2.SYSDEF_NM AS INTLTSH_NM,
                   M.WRK_CD AS PROCS_CD, MC3.SYSDEF_NM AS PROCS_NM, M.START_PAGE_CNT, M.END_PAGE_CNT,
                   M.EQP_CD, PES.EQP_NM, M.PLAN_DT, M.WRK_TM_CNT,
                   NVL(M.MTRIL_CD, PPIX.MTRIL_CD) AS MTRIL_CD, CI.ITEM_NM AS MTRIL_NM,
                   NVL(M.DTL_SIZE_DC, PPIX.DTL_SIZE_DC) AS DTL_SIZE_DC, NVL(M.PGS, PPIX.PGS) AS PGS, NVL(M.DTL_DC, PPIX.DTL_DC) AS DTL_DC,
                   NVL(M.PPR_DIVD_QT, PPIX.PPR_DIVD_QT) AS PPR_DIVD_QT,
                   M.PROC_QT, M.BASE_UNIT_CD, M.RMK_TXT,
                   NVL(M.CNFM_YN, 'N') AS CNFM_YN, NVL(M.ISSUE_YN, 'N') AS ISSUE_YN, NVL(M.PRPCNT_CLOSE_YN, 'N') AS PRPCNT_CLOSE_YN,
                   M.TOP_ORGN_CD, M.KEY_VAL_NM
            FROM PP_PLANPROCS_INFO_X20329 M
            LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON PPDX.COMPANY_CD = M.COMPANY_CD AND PPDX.PLANT_CD = M.PLANT_CD AND PPDX.PLAN_NO = M.PLAN_NO
                                                   AND PPDX.PLAN_HIS_SQ = M.PLAN_HIS_SQ AND PPDX.PLAN_SQ = M.PLAN_SQ
            LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPIX.COMPANY_CD = M.COMPANY_CD AND PPIX.PLANT_CD = M.PLANT_CD AND PPIX.KEY_VAL_NM = M.KEY_VAL_NM
            LEFT OUTER JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = M.COMPANY_CD AND PES.EQP_CD = M.EQP_CD AND PES.LANG_CD = 'KO'
            LEFT OUTER JOIN CI_ITEM CI ON CI.ITEM_CD = NVL(M.MTRIL_CD, PPIX.MTRIL_CD)
            """
            + code("MC", "PP", "Z005_20329", "M.OP_CD")
            + code("MC2", "PP", "Z002_20329", "M.INTLTSH_CD")
            + code("MC3", "SD", "Z010_20329", "M.WRK_CD")
            + code("MC4", "SD", "Z007_20329", "M.CONFIG_CD") + """
            WHERE M.COMPANY_CD = '1000' AND M.PLANT_CD = '1000' AND M.PLAN_NO = :planNo AND M.PLAN_HIS_SQ = 1
            ORDER BY M.PLAN_SQ, M.PLAN_LOW_SQ, M.PAGE_SQ, M.LINE_SQ, M.PROCS_SQ
            """;

    // ───────────────────────────── 접지 / 제본 탭 ─────────────────────────────
    /** 접지·제본은 같은 테이블(PP_PLANBBND_INFO)을 제품여부(LAST_YN)·보충(SUPP_YN)으로 가른다 — ERP 고정값. */
    private static final String FOLD_FILTER = "AND NVL(PPBIX.LAST_YN, 'N') != 'Y' AND NVL(PPBIX.SUPP_YN, 'N') != 'Y'";
    private static final String BIND_FILTER = "AND (NVL(PPBIX.LAST_YN, 'N') = 'Y' OR NVL(PPBIX.SUPP_YN, 'N') = 'Y')";

    private static String bbndSql(String filter, boolean bind) {
        // 접지 행은 KEY_VAL_NM 으로 인쇄 행과 잇고, 제본 행은 KEY_VAL_NM 이 없어 정본대로 순번(계획순번·하위순번)으로 잇는다(대개 못 이어 용지는 비어 있다).
        String prwJoin = bind
                ? "AND PPIX.PLAN_NO = PPBIX.PLAN_NO AND PPIX.PLAN_HIS_SQ = PPBIX.PLAN_HIS_SQ AND PPIX.PLAN_SQ = PPBIX.PLAN_SQ AND PPIX.PLAN_LOW_SQ = PPBIX.PLAN_LOW_SQ"
                : "AND PPIX.KEY_VAL_NM = PPBIX.KEY_VAL_NM";
        String mtril = bind ? "NULL AS MTRIL_CD, NULL AS MTRIL_NM," : "PPIX.MTRIL_CD, CI2.ITEM_NM AS MTRIL_NM,";
        return """
                SELECT PPBIX.COMPANY_CD, PPBIX.PLANT_CD, PPBIX.PLAN_NO, PPBIX.PLAN_HIS_SQ, PPBIX.PLAN_SQ, PPBIX.PLAN_LOW_SQ,
                       PPBIX.ORDDOC_NO, PPBIX.ORDDOC_SQ, PPBIX.PAGE_SQ, PPBIX.LINE_SQ,
                       PPBIX.ITEM_CD, CI.ITEM_NM, CI.ITEM_SPEC_DC, PPDX.SPCFCS_ITEM_NM, PPBIX.CONFIG_CD, MC.SYSDEF_NM AS CONFIG_NM,
                       PPBIX.INTLTSH_CD, MC5.SYSDEF_NM AS INTLTSH_NM, PPBIX.OP_CD, MC7.SYSDEF_NM AS OP_NM, PPBIX.WRK_CD, MC3.SYSDEF_NM AS WRK_NM,
                       PPBIX.FULL_PRPCNT_QT, PPBIX.FULL_PAGE_CNT, PPBIX.PRPCNT_SQ, PPBIX.EQP_CD, PES.EQP_NM, PPBIX.PLAN_DT, PPBIX.WRK_TM_CNT,
                """ + mtril + "\n" + """
                       PPIX.DTL_SIZE_DC, PPBIX.TOT_PGS, PPIX.DTL_DC, PPIX.PPR_DIVD_QT, PPBIX.ORD_QT, PPBIX.ORD_UNIT_CD,
                       NVL(PPBIX.CNFM_YN, 'N') AS CNFM_YN, NVL(PPBIX.ISSUE_YN, 'N') AS ISSUE_YN, NVL(PPBIX.PRPCNT_CLOSE_YN, 'N') AS PRPCNT_CLOSE_YN,
                       PPBIX.RMK_TXT, NVL(PPBIX.LAST_YN, 'N') AS LAST_YN, NVL(PPBIX.SUPP_YN, 'N') AS SUPP_YN, PPBIX.KEY_VAL_NM, PPBIX.TOP_ORGN_CD
                FROM PP_PLANBBND_INFO_X20329 PPBIX
                LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON PPDX.COMPANY_CD = PPBIX.COMPANY_CD AND PPDX.PLANT_CD = PPBIX.PLANT_CD AND PPDX.PLAN_NO = PPBIX.PLAN_NO
                                                       AND PPDX.PLAN_HIS_SQ = PPBIX.PLAN_HIS_SQ AND PPDX.PLAN_SQ = PPBIX.PLAN_SQ
                LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON PPIX.COMPANY_CD = PPBIX.COMPANY_CD AND PPIX.PLANT_CD = PPBIX.PLANT_CD
                """ + prwJoin + "\n" + """
                LEFT OUTER JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = PPBIX.COMPANY_CD AND PES.EQP_CD = PPBIX.EQP_CD AND PES.LANG_CD = 'KO'
                LEFT OUTER JOIN CI_ITEM CI ON CI.ITEM_CD = PPBIX.ITEM_CD
                LEFT OUTER JOIN CI_ITEM CI2 ON CI2.ITEM_CD = PPIX.MTRIL_CD
                """
                + code("MC", "SD", "Z007_20329", "PPBIX.CONFIG_CD")
                + code("MC3", "SD", "Z010_20329", "PPBIX.WRK_CD")
                + code("MC5", "PP", "Z002_20329", "PPBIX.INTLTSH_CD")
                + code("MC7", "PP", "Z005_20329", "PPBIX.OP_CD") + """
                WHERE PPBIX.COMPANY_CD = '1000' AND PPBIX.PLANT_CD = '1000' AND PPBIX.PLAN_NO = :planNo AND PPBIX.PLAN_HIS_SQ = 1
                """ + filter + "\n" + """
                ORDER BY PPBIX.PLAN_SQ, PPBIX.PLAN_LOW_SQ
                """;
    }

    private static final String FOLD_SQL = bbndSql(FOLD_FILTER, false);
    private static final String BIND_SQL = bbndSql(BIND_FILTER, true);

    // ───────────────────────────── 작업지시서 머리 ─────────────────────────────
    /**
     * 작업지시서 머리 — 주문·거래처·영업담당(이름·전화 HR_EMPINFO_DTL.TEL_NO, 사번당 1행)·부서·작업구분·계획번호.
     * 영업주의사항 = 주문 비고(SD_ORDER_MST.RMK_TXT), 생산주의사항 = 계획 비고(PP_PLAN_MST.RMK_TXT) — 양식의 두 칸을 이 둘로 본다(2026-10 ERP 에 다른 비고 컬럼 없음).
     */
    private static final String WORK_ORDER_HEAD_SQL = """
            SELECT SOMX.ORDDOC_NO, SOMX.ORDDOC_NM, SOMX.ORD_DT, SOMX.PARTNER_CD, CPM.PARTNER_NM,
                   SOMX.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS BIZRSPT_EMPNO_NM, HED.TEL_NO AS BIZRSPT_TEL_NO,
                   SOMX.DEPT_CD, MDM.DEPT_NM, SOMX.WRK_FG, MC.SYSDEF_NM AS WRK_FG_NM,
                   SOMX.RMK_TXT AS SALES_RMK_TXT, PPMX.PLAN_NO, PPMX.PLAN_HIS_SQ, PPMX.RMK_TXT AS PLAN_RMK_TXT
            FROM SD_ORDER_MST_X20329 SOMX
            LEFT OUTER JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = SOMX.PARTNER_CD
            LEFT OUTER JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = SOMX.COMPANY_CD AND HEM.EMP_NO = SOMX.BIZRSPT_EMPNO_CD
            LEFT OUTER JOIN HR_EMPINFO_DTL HED ON HED.COMPANY_CD = SOMX.COMPANY_CD AND HED.EMP_NO = SOMX.BIZRSPT_EMPNO_CD
            LEFT OUTER JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = SOMX.COMPANY_CD AND MDM.DEPT_CD = SOMX.DEPT_CD
            """ + code("MC", "SD", "Z024_20329", "SOMX.WRK_FG") + """
            LEFT OUTER JOIN (SELECT ORDDOC_NO, PLAN_NO, PLAN_HIS_SQ, RMK_TXT,
                                    ROW_NUMBER() OVER (PARTITION BY ORDDOC_NO ORDER BY PLAN_HIS_SQ DESC, PLAN_NO DESC) AS RN
                             FROM PP_PLAN_MST_X20329
                             WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND ORDDOC_NO = :orderNo) PPMX
                         ON PPMX.ORDDOC_NO = SOMX.ORDDOC_NO AND PPMX.RN = 1
            WHERE SOMX.COMPANY_CD = '1000' AND SOMX.PLAN_PLANT_CD = '1000' AND SOMX.ORDDOC_NO = :orderNo
            """;

    /** 의뢰 머리 — PP_PREORD_MST(의뢰번호 PLAN_ORD_NO·의뢰명 QODOC_NM·의뢰일 QUT_DT). 컬럼 별칭은 주문 머리와 같게 맞춘다. */
    private static final String REQUEST_HEAD_SQL = """
            SELECT POMX.PLAN_ORD_NO AS ORDDOC_NO, POMX.QODOC_NM AS ORDDOC_NM, POMX.QUT_DT AS ORD_DT, POMX.PARTNER_CD, CPM.PARTNER_NM,
                   POMX.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS BIZRSPT_EMPNO_NM, HED.TEL_NO AS BIZRSPT_TEL_NO,
                   POMX.DEPT_CD, MDM.DEPT_NM, POMX.WRK_FG, MC.SYSDEF_NM AS WRK_FG_NM,
                   POMX.RMK_TXT AS SALES_RMK_TXT, PPMX.PLAN_NO, PPMX.PLAN_HIS_SQ, PPMX.RMK_TXT AS PLAN_RMK_TXT
            FROM PP_PREORD_MST_X20329 POMX
            LEFT OUTER JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = POMX.PARTNER_CD
            LEFT OUTER JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = POMX.COMPANY_CD AND HEM.EMP_NO = POMX.BIZRSPT_EMPNO_CD
            LEFT OUTER JOIN HR_EMPINFO_DTL HED ON HED.COMPANY_CD = POMX.COMPANY_CD AND HED.EMP_NO = POMX.BIZRSPT_EMPNO_CD
            LEFT OUTER JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = POMX.COMPANY_CD AND MDM.DEPT_CD = POMX.DEPT_CD
            """ + code("MC", "SD", "Z024_20329", "POMX.WRK_FG") + """
            LEFT OUTER JOIN (SELECT ORDDOC_NO, PLAN_NO, PLAN_HIS_SQ, RMK_TXT,
                                    ROW_NUMBER() OVER (PARTITION BY ORDDOC_NO ORDER BY PLAN_HIS_SQ DESC, PLAN_NO DESC) AS RN
                             FROM PP_PLAN_MST_X20329
                             WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND ORDDOC_NO = :orderNo) PPMX
                         ON PPMX.ORDDOC_NO = POMX.PLAN_ORD_NO AND PPMX.RN = 1
            WHERE POMX.COMPANY_CD = '1000' AND POMX.PLANT_CD = '1000' AND POMX.PLAN_ORD_NO = :orderNo
            """;

    // ───────────────────────────── 조회 메서드 ─────────────────────────────

    /** 주문리스트 — 주문일(ORD_DT, 의뢰적용이면 의뢰일 QUT_DT) 기간 양끝 포함. request = 의뢰적용. */
    public List<Map<String, Object>> findOrders(LocalDate start, LocalDate end, boolean request) {
        return jdbc.query(request ? REQUEST_LIST_SQL : ORDER_LIST_SQL, new MapSqlParameterSource()
                .addValue("start", start.format(BASIC)).addValue("end", end.format(BASIC)), this::map);
    }

    /** 주문상세 — planNo 가 null 이면(미작성) 주문값만 나온다. */
    public List<Map<String, Object>> findOrderDetail(String orderNo, String planNo, boolean request) {
        return jdbc.query(request ? REQUEST_DETAIL_SQL : ORDER_DETAIL_SQL, new MapSqlParameterSource()
                .addValue("orderNo", orderNo).addValue("planNo", planNo == null ? "" : planNo), this::map);
    }

    /** 탭 행 — 계획번호 1건. 인쇄 탭의 주문 후가공 사양 LISTAGG 만 주문번호를 쓴다. */
    public List<Map<String, Object>> findTabRows(Tab tab, String planNo, String orderNo) {
        String sql = switch (tab) {
            case PRINT -> PRINT_SQL;
            case PLATE -> PLATE_SQL;
            case PROCESS -> PROCESS_SQL;
            case FOLD -> FOLD_SQL;
            case BIND -> BIND_SQL;
        };
        return jdbc.query(sql, new MapSqlParameterSource()
                .addValue("planNo", planNo).addValue("orderNo", orderNo == null ? "" : orderNo), this::map);
    }

    /** 작업지시서 머리 — 없으면 null. */
    public Map<String, Object> findWorkOrderHead(String orderNo, boolean request) {
        List<Map<String, Object>> rows = jdbc.query(request ? REQUEST_HEAD_SQL : WORK_ORDER_HEAD_SQL, new MapSqlParameterSource().addValue("orderNo", orderNo), this::map);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Map<String, Object> map(ResultSet rs, int i) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int c = 1; c <= md.getColumnCount(); c++) {
            Object v = rs.getObject(c);
            if (v instanceof String str) v = str.trim();
            if (v instanceof java.sql.Timestamp ts) v = ts.toLocalDateTime().toLocalDate().toString();
            row.put(camel(md.getColumnLabel(c)), v);
        }
        return row;
    }

    private static String camel(String label) {
        return OracleEquipmentPerfRepository.camel(label.toUpperCase(Locale.ROOT));
    }
}
