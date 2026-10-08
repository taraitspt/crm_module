package com.tara.crm.production.repository;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 생산일정현황 (TPS, 회사 1000 / 공장 1000) — ERP 인쇄·제본·코팅 생산일정현황 화면 쿼리 이식(사용자 제공 2026-10-06). 조회 전용.
 *
 * <p>세 탭 모두 "계획일 기간 + 설비 유형(PM_EQ_DTL.EQP_TP_CD)" 으로 거른다. 설비 유형: 인쇄 201 매엽·202 국윤전·203 46윤전,
 * 제본 401 무선·402 중철·403 양장·404 링·405 재단·406 접지·407 기타제본·408 수작업, 코팅 301 하나.
 * <ul>
 *   <li>인쇄: 인쇄 계획 행(PP_PLANPRW_INFO, 합대 자품목 제외) 단위. 쪽수 = 설비 도수(PRW_PTCR_CNT) 8이면 1, 아니면 뒤 도수 있으면 2 아니면 1.
 *       통수 = (합대면 정미연수×500, 아니면 정미매수) × 쪽수. 작업통수 = 실적(ARLT_QT)×쪽수 + MES 미연동 작업확인(ME_WOCONF_DTL, WC20) 정미/2.
 *       용지입고 = 구매지(100)는 발주 입고+수입수량>0, 재고지(200)는 자재예약 출고전표 미취소. 진행상태 PRW_ISSUE_YN = 인쇄 실적 발행 행 수,
 *       실적 ISSUE_YN = 제판 미발행 행이 0이면 Y.</li>
 *   <li>제본: 제본 계획 행(PP_PLANBBND_INFO, 제품/보충 행) 단위, 집계 없음. 인쇄 PLANPRW_YN / 접지 PLANORGM_YN = 같은 계획의 해당 행이 모두 마감이면 Y.
 *       WRK_CD 는 이름과 달리 "실적 Y 이고 마감 Y" 완료 플래그. 제본처 = 외주 설비(사내외 02 + 작업장 구분 2)면 발주 거래처, 아니면 설비명.</li>
 *   <li>코팅: 후가공 계획 행(PP_PLANPROCS_INFO) 단위. 작업매수 = MES/OSC 연동 생산실적(PP_PROD_IF, WC30) 합, 잔여 = 인쇄 계획 정미매수 − 작업매수.
 *       인쇄설비·인쇄계획일·인쇄완료는 같은 KEY_VAL_NM 의 인쇄 행에서.</li>
 * </ul>
 * 정본과 다른 점: 바인딩(기간·설비유형·검색어)을 뺐고, 인쇄 탭에 설비명(PM_EQ_SDTL)을 더했다(정본엔 코드만). 컬럼이 많아 Map(camelCase)으로 내려준다.
 * 인쇄 탭 속도: 정본은 제본처(3.4만 행)·후가공 목록(1.5만 행)·MES 실적·작업확인·용지입고 서브쿼리를 전 기간으로 만든 뒤 597행과 조인해 1주 조회가 13~16초였다.
 * 부품별로는 합쳐 6초라 결합이 느린 것. 세미조인·힌트(MATERIALIZE/NO_MERGE)·리터럴 바인딩으로는 안 풀려(힌트·리터럴은 300초 초과) 2026-10-06 **뼈대 + 보조 집계 5개 병렬 조회 후 자바 합성**으로 바꿨다(findPrintRows). 결과는 같다.
 */
@Repository
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleProductionScheduleRepository {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(OracleProductionScheduleRepository.class);

    private final NamedParameterJdbcTemplate jdbc;

    public OracleProductionScheduleRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    public enum Tab { PRINT, BIND, COAT }

    /** 제본처 — 제품 행(하위순번 500 이상·LAST_YN) 설비가 외주면 발주 거래처명. 인쇄·코팅 탭이 같이 쓴다. */
    private static final String BIND_PARTNER_SUB = """
            (SELECT B.COMPANY_CD, B.PLANT_CD, B.PLAN_NO, B.PLAN_SQ, B.BAN_ITEM_CD, B.OP_CD, B.OP_NM,
                    LISTAGG(B.BND_PARTNER_NM, ',') WITHIN GROUP (ORDER BY B.PLAN_NO, B.PLAN_SQ) AS BND_PARTNER_NM
             FROM (SELECT DISTINCT PPBIX.COMPANY_CD, PPBIX.PLANT_CD, PPBIX.PLAN_NO, PPBIX.PLAN_SQ, PPBIX.BAN_ITEM_CD, PPBIX.OP_CD, MC7.SYSDEF_NM AS OP_NM,
                          CASE WHEN MEI.INOUTCOM_FG = '02' AND MWI.WC_FG_CD = '2' THEN CPM_PPDM.PARTNER_NM ELSE MEI.EQP_NM END BND_PARTNER_NM
                   FROM PP_PLANBBND_INFO_X20329 PPBIX
                   LEFT OUTER JOIN PP_PURORDER_DTL_X20329 PUDX ON PUDX.COMPANY_CD = PPBIX.COMPANY_CD AND PUDX.PLANT_CD = PPBIX.PLANT_CD
                                                              AND PUDX.PLAN_NO = PPBIX.PLAN_NO AND PUDX.PLAN_SQ = PPBIX.PLAN_SQ AND PUDX.ITEM_CD = PPBIX.BAN_ITEM_CD
                   LEFT OUTER JOIN PP_PURORDER_MST_X20329 PPDM ON PPDM.COMPANY_CD = PPBIX.COMPANY_CD AND PPDM.PLANT_CD = PPBIX.PLANT_CD AND PPDM.PURDOC_NO = PUDX.PURDOC_NO
                   LEFT OUTER JOIN CI_PARTNER_MST CPM_PPDM ON CPM_PPDM.PARTNER_CD = PPDM.PARTNER_CD
                   LEFT OUTER JOIN MA_CODEDTL MC7 ON MC7.COMPANY_CD = PPBIX.COMPANY_CD AND MC7.MODULE_CD = 'PP' AND MC7.FIELD_CD = 'Z005_20329' AND MC7.SYSDEF_CD = PPBIX.OP_CD
                   LEFT OUTER JOIN ME_EQPCAPA_INFO MEI ON PPBIX.COMPANY_CD = MEI.COMPANY_CD AND PPBIX.PLANT_CD = MEI.PLANT_CD AND PPBIX.EQP_CD = MEI.EQP_CD
                   LEFT OUTER JOIN PP_OP_EQP_INFO POEI ON POEI.COMPANY_CD = MEI.COMPANY_CD AND POEI.PLANT_CD = MEI.PLANT_CD AND POEI.EQP_CD = MEI.EQP_CD
                   LEFT OUTER JOIN PP_WCOP_MST PWM ON PWM.COMPANY_CD = POEI.COMPANY_CD AND PWM.PLANT_CD = POEI.PLANT_CD AND PWM.OP_CD = POEI.OP_CD
                   LEFT OUTER JOIN MA_WRK_INFO MWI ON MWI.COMPANY_CD = PWM.COMPANY_CD AND MWI.PLANT_CD = PWM.PLANT_CD AND MWI.WC_CD = PWM.WC_CD
                   WHERE PPBIX.COMPANY_CD = '1000' AND PPBIX.PLAN_LOW_SQ >= 500 AND PPBIX.LAST_YN = 'Y' %BND_RANGE%) B
             GROUP BY B.COMPANY_CD, B.PLANT_CD, B.PLAN_NO, B.PLAN_SQ, B.BAN_ITEM_CD, B.OP_CD, B.OP_NM) PPB
            """;

    /** 쪽수 CASE — 설비 도수 8이면 1, 8 미만이고 뒤 도수가 있으면 2(양면), 없으면 1. */
    private static final String PAGE_CASE = """
            CASE WHEN MEI2.PRW_PTCR_CNT = 8 THEN 1
                 WHEN MEI2.PRW_PTCR_CNT < 8 AND NVL(PPIX.GNRL_PRW_AFTR_QT, 0) > 0 THEN 2
                 WHEN MEI2.PRW_PTCR_CNT < 8 AND NVL(PPIX.GNRL_PRW_AFTR_QT, 0) = 0 THEN 1
                 ELSE 0 END""";
    /** 정미 매수 — 합대 모품목은 정미연수×500, 아니면 정미매수. */
    private static final String NET_SHEETS = "CASE WHEN NVL(PPIX.GRPG_YN, 'N') = 'Y' THEN NVL(PPIX.VNR_NET_QT, 0) * 500 ELSE NVL(PPIX.NET_PPCNT_QT, 0) END";

    /** 기간 안 인쇄 계획번호 — 보조 서브쿼리(작업확인·용지발주·자재예약)를 전 기간이 아니라 이 계획들로 좁힌다(1주 16s → 수 초). */
    private static final String PLAN_IN_RANGE = """
            (SELECT DISTINCT PLAN_NO FROM PP_PLANPRW_INFO_X20329 WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND PLAN_DT BETWEEN :start AND :end)""";

    private static final String COMMON_WHERE = """
            AND PPIX.PLAN_DT BETWEEN :start AND :end
            AND (:eqpTp IS NULL OR PED.EQP_TP_CD = :eqpTp)
            AND UPPER(PPIX.PLAN_NO) LIKE '%' || UPPER(:planNo) || '%'
            AND UPPER(PPIX.ORDDOC_NO) LIKE '%' || UPPER(:orderNo) || '%'
            """;

    // ───────────────────────────── 인쇄 ─────────────────────────────
    // 인쇄 탭은 정본 쿼리를 한 덩어리로 돌리지 않는다(2026-10-06). 뼈대(인쇄 계획 행 + 주문·품목·설비 코드)만 SQL 로 집계하고,
    // 무거운 보조 집계 다섯 개(제본처 PPB · 후가공 WRK_CD 목록 PPPIX · MES 미연동 작업확인 MWDX · 구매지 용지입고 PPSX · 재고지 용지입고 IMSX)는
    // 각각 "기간 안 계획번호"로 좁힌 독립 쿼리로 **병렬** 조회해 자바에서 붙인다.
    // 이유: 부품별로는 0.3~2.5초인데 한 SQL 로 합치면 1주 조회가 12~24초였고, 힌트(MATERIALIZE/NO_MERGE)·리터럴 바인딩은 300초를 넘겨 더 나빠졌다.
    // 결과는 정본과 같다 — 보조 집계는 모두 그룹 키(계획/차수/순번/하위순번 또는 KEY_VAL_NM)당 한 행이라 조인해도 행이 늘지 않고,
    // 제본처(PPB)만 공정(OP_CD)마다 행이 갈라지는데 그건 자바에서 똑같이 갈라 준다. 합계(SUM)에 곱해지던 중복 조인 배수는 COUNT(*)=ROW_MULT 로 들고 와 그대로 곱한다.

    /** 뼈대 — 정본 SELECT 에서 PPB·PPPIX·MWDX·PPSX·IMSX 조인만 뺀 것. 내부 열 ISSUE_RAW·PPR_FG_CD·KEY_VAL_NM·ARLT_CNT·ROW_MULT 는 자바 합성 후 지운다. */
    private static final String PRINT_BASE_SQL = """
            SELECT PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.PLMK_CD, MC_PLMK.SYSDEF_NM AS PLMK_NM,
                   SUM(CASE WHEN NVL(PPIX.ISSUE_YN, 'N') = 'Y' THEN 1 ELSE 0 END) AS PRW_ISSUE_YN,
                   SUM(CASE WHEN NVL(PPLIX.ISSUE_YN, 'N') = 'N' THEN 1 ELSE 0 END) AS ISSUE_RAW,
                   MIX.PPR_FG_CD,
                   NVL(PPIX.ISPC_YN, 'N') AS ISPC_YN,
                   PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.SCHDUL_SQ, PPIX.PRPCNT_SQ, PPIX.CNFM_YN, PPIX.KEY_VAL_NM,
                   TO_CHAR(SODX.CNFM_DTS, 'yyyyMMdd') AS CNFM_DTS, TO_CHAR(PPDX.RCPT_PRRG_DTS, 'yyyyMMdd') AS RCPT_PRRG_DTS, TO_CHAR(PPDX.DLVSH_DTS, 'yyyyMMdd') AS DLVSH_DTS,
                   NVL(SOMX.PARTNER_CD, PPRM_X.PARTNER_CD) AS PARTNER_CD, CPM_SOMX.PARTNER_NM, PPIX.ITEM_CD, PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM, PPIX.CONFIG_CD, MC_CONFIG.SYSDEF_NM AS CONFIG_NM, PPIX.PR_RMK_DC,
                   PPIX.PLAN_DT, NVL(PPIX.WRK_TM_CNT, 0) AS WRK_TM_CNT,
                   PPIX.MTRIL_CD, CI_MTRIL.ITEM_NM AS MTRIL_NM, PPIX.DTL_SIZE_DC,
                   (COALESCE(PPIX.GNRL_PRW_BEF_QT, 0) + COALESCE(PPIX.SPCLR_PRW_BEF_QT, 0)) || '/' || (COALESCE(PPIX.GNRL_PRW_AFTR_QT, 0) + COALESCE(PPIX.SPCLR_PRW_AFTR_QT, 0)) AS GNRL_QT,
                   SUM(CASE WHEN NVL(PPIX.VNR_NET_QT, 0) > 0 THEN NVL(PPIX.VNR_NET_QT, 0) * 500 ELSE NVL(PPIX.NET_PPCNT_QT, 0) END) AS NET_PPCNT_QT,
                   PPIX.EQP_CD, PES_EQ.EQP_NM,
                   SUM(""" + PAGE_CASE + """
            ) AS PAGE_NO,
                   SUM(""" + NET_SHEETS + " * " + PAGE_CASE + """
            ) AS TONG_CNT,
                   SUM(NVL(PPIX.ARLT_QT, 0) * """ + PAGE_CASE + """
            ) AS ARLT_CNT,
                   COUNT(*) AS ROW_MULT,
                   MAX(PPIX.WRK_UM) AS WRK_UM, PPIX.WRK_AMT, PPIX.ORDDOC_NO, PPIX.ORDDOC_SQ, PPLIX.CMPT_YN, PPIX.PRPCNT_CLOSE_YN
            FROM PP_PLANPRW_INFO_X20329 PPIX
            LEFT OUTER JOIN PM_EQ_DTL PED ON PED.COMPANY_CD = PPIX.COMPANY_CD AND PED.EQP_CD = PPIX.EQP_CD AND PED.PLANT_CD = PPIX.PLANT_CD
            LEFT OUTER JOIN PM_EQ_SDTL PES_EQ ON PES_EQ.COMPANY_CD = PPIX.COMPANY_CD AND PES_EQ.EQP_CD = PPIX.EQP_CD AND PES_EQ.LANG_CD = 'KO'
            LEFT OUTER JOIN SD_ORDER_DTL_X20329 SODX ON PPIX.COMPANY_CD = SODX.COMPANY_CD AND PPIX.ORDDOC_NO = SODX.ORDDOC_NO AND PPIX.ORDDOC_SQ = SODX.ORDDOC_SQ
            LEFT OUTER JOIN SD_ORDER_MST_X20329 SOMX ON PPIX.COMPANY_CD = SOMX.COMPANY_CD AND PPIX.ORDDOC_NO = SOMX.ORDDOC_NO
            LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON PPIX.COMPANY_CD = PPDX.COMPANY_CD AND PPIX.PLAN_NO = PPDX.PLAN_NO AND PPIX.PLAN_HIS_SQ = PPDX.PLAN_HIS_SQ AND PPIX.PLAN_SQ = PPDX.PLAN_SQ
            LEFT OUTER JOIN ME_EQPCAPA_INFO MEI2 ON PPIX.COMPANY_CD = MEI2.COMPANY_CD AND PPIX.PLANT_CD = MEI2.PLANT_CD AND PPIX.EQP_CD = MEI2.EQP_CD
            -- 거래처 = 주문(TOR) 또는 의뢰(PQE) — 정본은 주문만 봐서 의뢰 건이 비었다(2026-10-08, 생산 화면 공통)
            LEFT OUTER JOIN PP_PREORD_MST_X20329 PPRM_X ON PPRM_X.COMPANY_CD = PPIX.COMPANY_CD AND PPRM_X.PLAN_ORD_NO = PPIX.ORDDOC_NO
            LEFT OUTER JOIN CI_PARTNER_MST CPM_SOMX ON CPM_SOMX.PARTNER_CD = NVL(SOMX.PARTNER_CD, PPRM_X.PARTNER_CD)
            LEFT OUTER JOIN CI_ITEM CI_MTRIL ON PPIX.MTRIL_CD = CI_MTRIL.ITEM_CD
            LEFT OUTER JOIN MA_CODEDTL MC_PLMK ON PPIX.COMPANY_CD = MC_PLMK.COMPANY_CD AND PPIX.PLMK_CD = MC_PLMK.SYSDEF_CD AND MC_PLMK.MODULE_CD = 'SD' AND MC_PLMK.FIELD_CD = 'Z010_20329'
            LEFT OUTER JOIN MA_CODEDTL MC_CONFIG ON PPIX.COMPANY_CD = MC_CONFIG.COMPANY_CD AND PPIX.CONFIG_CD = MC_CONFIG.SYSDEF_CD AND MC_CONFIG.MODULE_CD = 'SD' AND MC_CONFIG.FIELD_CD = 'Z007_20329'
            LEFT OUTER JOIN PP_PLANPLMK_INFO_X20329 PPLIX ON PPLIX.COMPANY_CD = PPIX.COMPANY_CD AND PPLIX.PLANT_CD = PPIX.PLANT_CD AND PPLIX.KEY_VAL_NM = PPIX.KEY_VAL_NM AND COALESCE(PPLIX.SUPP_YN, 'N') = 'N'
            LEFT OUTER JOIN MA_ITEM_X20329 MIX ON MIX.COMPANY_CD = PPIX.COMPANY_CD AND MIX.ITEM_CD = PPIX.MTRIL_CD
            WHERE PPIX.COMPANY_CD = '1000' AND PPIX.PLANT_CD = '1000'
            AND NVL(PPIX.GRP_YN, 'N') NOT IN ('Y')
            """ + COMMON_WHERE + """
            GROUP BY PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.PLMK_CD, MC_PLMK.SYSDEF_NM, MIX.PPR_FG_CD,
                     PPIX.ISPC_YN, PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.SCHDUL_SQ, PPIX.PRPCNT_SQ, PPIX.CNFM_YN, PPIX.KEY_VAL_NM,
                     SODX.CNFM_DTS, PPDX.RCPT_PRRG_DTS, PPDX.DLVSH_DTS, NVL(SOMX.PARTNER_CD, PPRM_X.PARTNER_CD), CPM_SOMX.PARTNER_NM, PPIX.ITEM_CD, PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM,
                     PPIX.CONFIG_CD, MC_CONFIG.SYSDEF_NM, PPIX.PR_RMK_DC, PPIX.PLAN_DT, PPIX.WRK_TM_CNT,
                     PPIX.MTRIL_CD, CI_MTRIL.ITEM_NM, PPIX.DTL_SIZE_DC, PPIX.GNRL_PRW_BEF_QT, PPIX.SPCLR_PRW_BEF_QT, PPIX.GNRL_PRW_AFTR_QT, PPIX.SPCLR_PRW_AFTR_QT,
                     PPIX.WRK_AMT, PPIX.ORDDOC_NO, PPIX.ORDDOC_SQ, PPLIX.CMPT_YN, PPIX.EQP_CD, PES_EQ.EQP_NM, PPIX.PRPCNT_CLOSE_YN
            ORDER BY PPIX.PLAN_DT, PPIX.SCHDUL_SQ, PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ
            """;

    /** 제본처 — 계획/순번/제품품목/공정당 한 행. 공정이 여럿이면 뼈대 행이 그만큼 갈라진다(정본의 GROUP BY 와 같음). */
    private static final String PRINT_AUX_PPB_SQL = "SELECT PPB.PLAN_NO, PPB.PLAN_SQ, PPB.BAN_ITEM_CD, PPB.OP_CD, PPB.OP_NM, PPB.BND_PARTNER_NM FROM "
            + BIND_PARTNER_SUB.replace("%BND_RANGE%", "AND PPBIX.PLAN_NO IN " + PLAN_IN_RANGE);

    /** 후가공 작업 코드/이름 목록 — KEY_VAL_NM 당 한 행. */
    private static final String PRINT_AUX_PPPIX_SQL = """
            SELECT PPPIX.KEY_VAL_NM,
                   LISTAGG(PPPIX.WRK_CD, '-') WITHIN GROUP (ORDER BY PLAN_NO, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ) AS WRK_CD,
                   LISTAGG(MC_WRK.SYSDEF_NM, '-') WITHIN GROUP (ORDER BY PLAN_NO, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ) AS WRK_NM
            FROM PP_PLANPROCS_INFO_X20329 PPPIX
            LEFT OUTER JOIN MA_CODEDTL MC_WRK ON PPPIX.COMPANY_CD = MC_WRK.COMPANY_CD AND PPPIX.WRK_CD = MC_WRK.SYSDEF_CD AND MC_WRK.MODULE_CD = 'SD' AND MC_WRK.FIELD_CD = 'Z010_20329'
            WHERE PPPIX.COMPANY_CD = '1000' AND PPPIX.PLANT_CD = '1000' AND PPPIX.PLAN_NO IN """ + PLAN_IN_RANGE + """

            GROUP BY PPPIX.COMPANY_CD, PPPIX.PLANT_CD, PPPIX.PLAN_NO, PPPIX.PLAN_SQ, PPPIX.KEY_VAL_NM
            """;

    /**
     * 작업확인(WC20) 작업량 — 계획/순번/하위순번당 정미/2. MES 로 실적이 넘어간 라인은 자바에서 0 으로 바꾼다(PRINT_AUX_PPI_SQL).
     * 기간 안 행을 먼저 뽑는 인라인 뷰(ROWNUM > 0 = 뷰 병합 금지)로 설비·설비유형 조인을 그 뒤에 — 정본대로 조인하면 설비 쪽에서 시작해 2.9초, 이렇게 하면 0.3초(행 수 동일 1,605).
     */
    private static final String PRINT_AUX_MWDX_SQL = """
            SELECT M.PLAN_NO, M.PLAN_SQ, M.PLAN_LOW_SQ, SUM(M.NET_QT) / 2 AS HALF_NET_QT
            FROM (SELECT MWDX.COMPANY_CD, MWDX.PLANT_CD, MWDX.PLAN_NO, MWDX.PLAN_SQ, MWDX.PLAN_LOW_SQ, MWDX.EQP_CD, MWDX.NET_QT
                  FROM ME_WOCONF_DTL_X20329 MWDX
                  WHERE MWDX.COMPANY_CD = '1000' AND MWDX.PLANT_CD = '1000' AND MWDX.PLAN_NO IN """ + PLAN_IN_RANGE + """
             AND ROWNUM > 0) M
            INNER JOIN PM_EQ_DTL PED ON M.COMPANY_CD = PED.COMPANY_CD AND M.PLANT_CD = PED.PLANT_CD AND M.EQP_CD = PED.EQP_CD
            INNER JOIN MA_CODEDTL MC ON MC.COMPANY_CD = PED.COMPANY_CD AND MC.MODULE_CD = 'PM' AND MC.FIELD_CD = 'P00470' AND MC.SYSDEF_CD = PED.EQP_TP_CD
            WHERE MC.FLAG_CD = 'WC20'
            GROUP BY M.PLAN_NO, M.PLAN_SQ, M.PLAN_LOW_SQ
            """;

    /** MES 로 실적이 들어온 작업확인 라인(계획/순번/하위순번) — PP_PROD_IF 가 190만 행에 SODOC_NO 인덱스가 없어 1.2초. 따로 돌려 병렬로 숨긴다. */
    private static final String PRINT_AUX_PPI_SQL = """
            SELECT PPI.SODOC_NO AS PLAN_NO, PPI.SODOC_SQ AS PLAN_SQ, PPI.INTL_NO AS PLAN_LOW_SQ
            FROM PP_PROD_IF PPI
            WHERE PPI.COMPANY_CD = '1000' AND PPI.PLANT_CD = '1000' AND PPI.INTL_SYS_CD = 'MES' AND PPI.CRUD_FG = 'I' AND PPI.REL1_CD = 'WC20'
              AND PPI.SODOC_NO IN """ + PLAN_IN_RANGE + """

            GROUP BY PPI.SODOC_NO, PPI.SODOC_SQ, PPI.INTL_NO
            """;

    /** 구매지 용지입고 — 발주 입고수량+수입수량 > 0 (26.02.02 기준). */
    private static final String PRINT_AUX_PPSX_SQL = """
            SELECT PPSX.PLAN_NO, PPSX.PLAN_SQ, PPSX.PLAN_LOW_SQ, MAX(PPD.PURDOC_NO) AS PURDOC_NO
            FROM PU_PURORDER_SDTL_X20329 PPSX
            INNER JOIN PU_PURORDERDLV_DTL PPD ON PPD.COMPANY_CD = PPSX.COMPANY_CD AND PPD.PURDOC_NO = PPSX.PURDOC_NO AND PPD.PURDOC_SQ = PPSX.PURDOC_SQ
                                             AND NVL(PPD.PO_CNCL_YN, 'N') = 'N' AND PPD.PURWRHSNG_QT + PPD.IMPR_QT > 0
            WHERE PPSX.COMPANY_CD = '1000' AND PPSX.PLAN_NO IN """ + PLAN_IN_RANGE + """

            GROUP BY PPSX.COMPANY_CD, PPSX.PLAN_NO, PPSX.PLAN_SQ, PPSX.PLAN_LOW_SQ
            """;

    /** 재고지 용지입고 — 자재예약의 출고전표가 미취소 (26.02.02 기준). */
    private static final String PRINT_AUX_IMSX_SQL = """
            SELECT IMSX.PLAN_NO, IMSX.PLAN_SQ, IMSX.PLAN_LOW_SQ, MAX(IMSX.INVTRX_RSV_NO) AS INVTRX_RSV_NO
            FROM IM_MTLRSV_SDTL_X20329 IMSX
            INNER JOIN IM_MTLDOC_DTL IMD ON IMD.COMPANY_CD = IMSX.COMPANY_CD AND IMD.RSV_NO = IMSX.INVTRX_RSV_NO AND IMD.RSV_SQ = IMSX.INVTRX_RSV_SQ AND NVL(IMD.INVTRX_CNCL_YN, 'N') = 'N'
            WHERE IMSX.COMPANY_CD = '1000' AND IMSX.PLAN_NO IN """ + PLAN_IN_RANGE + """

            GROUP BY IMSX.COMPANY_CD, IMSX.PLAN_NO, IMSX.PLAN_SQ, IMSX.PLAN_LOW_SQ
            """;

    /** 보조 조회 여섯 개를 동시에 돌리는 풀 — ERP 커넥션 풀(기본 10) 안에서 뼈대 1 + 보조 6. */
    private static final ExecutorService PRINT_POOL = Executors.newFixedThreadPool(6, r -> {
        Thread t = new Thread(r, "sched-print-aux");
        t.setDaemon(true);
        return t;
    });

    /** 인쇄 탭 — 뼈대 + 보조 집계 병렬 조회 후 자바에서 합성. 1주(600행) 기준 12~13초 → 수 초. */
    private List<Map<String, Object>> findPrintRows(MapSqlParameterSource p) {
        MapSqlParameterSource range = new MapSqlParameterSource().addValue("start", p.getValue("start")).addValue("end", p.getValue("end"));
        long t0 = System.currentTimeMillis();
        CompletableFuture<List<Map<String, Object>>> ppb = timed("PPB", () -> jdbc.query(PRINT_AUX_PPB_SQL, range, this::map));
        CompletableFuture<List<Map<String, Object>>> pppix = timed("PPPIX", () -> jdbc.query(PRINT_AUX_PPPIX_SQL, range, this::map));
        CompletableFuture<List<Map<String, Object>>> mwdx = timed("MWDX", () -> jdbc.query(PRINT_AUX_MWDX_SQL, range, this::map));
        CompletableFuture<List<Map<String, Object>>> ppi = timed("PPI", () -> jdbc.query(PRINT_AUX_PPI_SQL, range, this::map));
        CompletableFuture<List<Map<String, Object>>> ppsx = timed("PPSX", () -> jdbc.query(PRINT_AUX_PPSX_SQL, range, this::map));
        CompletableFuture<List<Map<String, Object>>> imsx = timed("IMSX", () -> jdbc.query(PRINT_AUX_IMSX_SQL, range, this::map));
        long tb = System.currentTimeMillis();
        List<Map<String, Object>> base = jdbc.query(PRINT_BASE_SQL, p, this::map);   // 뼈대는 호출 스레드에서
        log.debug("[schedule/print] BASE {}ms rows={}", System.currentTimeMillis() - tb, base.size());

        Map<String, List<Map<String, Object>>> ppbByKey = new HashMap<>();
        for (Map<String, Object> r : ppb.join()) ppbByKey.computeIfAbsent(k(r, "planNo", "planSq", "banItemCd"), x -> new ArrayList<>()).add(r);
        Map<String, Map<String, Object>> procByKey = new HashMap<>();
        for (Map<String, Object> r : pppix.join()) procByKey.putIfAbsent(str(r.get("keyValNm")), r);
        // 정본 CASE WHEN COUNT(PPI.COUNT_PROD_NO) > 0 THEN 0 ELSE SUM(NET_QT)/2 — MES 실적이 있는 라인은 0.
        Set<String> mesLines = new HashSet<>();
        for (Map<String, Object> r : ppi.join()) mesLines.add(k(r, "planNo", "planSq", "planLowSq"));
        Map<String, BigDecimal> reNetByKey = new HashMap<>();
        for (Map<String, Object> r : mwdx.join()) {
            String key = k(r, "planNo", "planSq", "planLowSq");
            reNetByKey.put(key, mesLines.contains(key) ? BigDecimal.ZERO : num(r.get("halfNetQt")));
        }
        Set<String> purchased = new HashSet<>();
        for (Map<String, Object> r : ppsx.join()) if (r.get("purdocNo") != null) purchased.add(k(r, "planNo", "planSq", "planLowSq"));
        Set<String> reserved = new HashSet<>();
        for (Map<String, Object> r : imsx.join()) if (r.get("invtrxRsvNo") != null) reserved.add(k(r, "planNo", "planSq", "planLowSq"));

        List<Map<String, Object>> out = new ArrayList<>(base.size() + 32);
        for (Map<String, Object> b : base) {
            String lineKey = k(b, "planNo", "planSq", "planLowSq");
            // 용지입고 — 구매지(100)는 발주 입고, 재고지(200)는 자재예약 출고전표. 정본 CASE 그대로.
            String pprFg = str(b.get("pprFgCd"));
            String purYn = "100".equals(pprFg) && purchased.contains(lineKey) ? "Y"
                    : "200".equals(pprFg) && reserved.contains(lineKey) ? "Y" : "N";
            BigDecimal tong = num(b.get("tongCnt"));
            BigDecimal arlt = num(b.get("arltCnt"));
            BigDecimal mult = num(b.get("rowMult"));
            BigDecimal reNet = reNetByKey.getOrDefault(lineKey, BigDecimal.ZERO).multiply(mult);   // 정본 SUM(NVL(MWDX.RE_NET_QT,0)) = 그룹 행 수 × 값
            BigDecimal work = arlt.add(reNet);
            BigDecimal reTong = tong.subtract(arlt).subtract(reNet);
            Map<String, Object> proc = procByKey.get(str(b.get("keyValNm")));
            List<Map<String, Object>> bnds = ppbByKey.getOrDefault(k(b, "planNo", "planSq", "itemCd"), List.of());

            List<Map<String, Object>> splits = bnds.isEmpty() ? Collections.singletonList(null) : bnds;
            for (Map<String, Object> bnd : splits) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("companyCd", b.get("companyCd")); r.put("plantCd", b.get("plantCd"));
                r.put("plmkCd", b.get("plmkCd")); r.put("plmkNm", b.get("plmkNm"));
                r.put("prwIssueYn", b.get("prwIssueYn"));
                r.put("issueYn", num(b.get("issueRaw")).signum() == 0 ? "Y" : "N");
                r.put("purwrhsngQtYn", purYn);
                r.put("ispcYn", b.get("ispcYn"));
                for (String c : List.of("planNo", "planHisSq", "planSq", "planLowSq", "schdulSq", "prpcntSq", "cnfmYn", "cnfmDts", "rcptPrrgDts", "dlvshDts",
                        "partnerCd", "partnerNm", "itemCd", "itemNm", "spcfcsItemNm", "configCd", "configNm", "prRmkDc")) r.put(c, b.get(c));
                r.put("opCd", bnd == null ? null : bnd.get("opCd"));
                r.put("opNm", bnd == null ? null : bnd.get("opNm"));
                r.put("bndPartnerNm", bnd == null ? null : bnd.get("bndPartnerNm"));
                r.put("wrkCd", proc == null ? null : proc.get("wrkCd"));
                r.put("wrkNm", proc == null ? null : proc.get("wrkNm"));
                for (String c : List.of("planDt", "wrkTmCnt", "mtrilCd", "mtrilNm", "dtlSizeDc", "gnrlQt", "netPpcntQt", "eqpCd", "eqpNm", "pageNo")) r.put(c, b.get(c));
                r.put("tongCnt", plain(tong));
                r.put("workCnt", plain(work.compareTo(tong) > 0 ? tong : work));
                r.put("reTongCnt", plain(reTong));
                for (String c : List.of("wrkUm", "wrkAmt", "orddocNo", "orddocSq", "cmptYn")) r.put(c, b.get(c));
                r.put("prpcntCloseYn", b.get("prpcntCloseYn") == null ? "N" : b.get("prpcntCloseYn"));
                out.add(r);
            }
        }
        log.debug("[schedule/print] total {}ms out={}", System.currentTimeMillis() - t0, out.size());
        return out;
    }

    /** 보조 조회 하나를 풀에서 돌리고 걸린 시간을 남긴다 — 어느 집계가 ERP 상태에 따라 튀는지 보려고. */
    private CompletableFuture<List<Map<String, Object>>> timed(String name, java.util.function.Supplier<List<Map<String, Object>>> q) {
        return CompletableFuture.supplyAsync(() -> {
            long t = System.currentTimeMillis();
            List<Map<String, Object>> r = q.get();
            log.debug("[schedule/print] {} {}ms rows={}", name, System.currentTimeMillis() - t, r.size());
            return r;
        }, PRINT_POOL);
    }

    private static String k(Map<String, Object> r, String... cols) {
        StringBuilder sb = new StringBuilder();
        for (String c : cols) sb.append(plainStr(r.get(c))).append('|');
        return sb.toString();
    }

    private static String str(Object v) { return v == null ? null : String.valueOf(v); }

    /** 숫자 키(순번 등)는 1 과 1.0 이 같은 키가 되게 평문으로. */
    private static String plainStr(Object v) {
        if (v instanceof BigDecimal d) return plain(d).toPlainString();
        return v == null ? "" : String.valueOf(v);
    }

    private static BigDecimal num(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal d) return d;
        if (v instanceof Number n) return new BigDecimal(n.toString());
        return new BigDecimal(String.valueOf(v));
    }

    /** 뒤 0 제거(12.50 → 12.5, 25.0 → 25). 지수 표기는 안 쓴다. */
    private static BigDecimal plain(BigDecimal d) {
        BigDecimal s = d.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }

    // ───────────────────────────── 제본 ─────────────────────────────
    private static final String BIND_SQL = """
            SELECT T.COMPANY_CD, T.PLANT_CD, T.ORDDOC_NO, T.ORDDOC_SQ, T.PLANPRW_YN, T.PLANORGM_YN, T.ISSUE_YN, T.WRK_CD,
                   T.PLAN_NO, T.PLAN_HIS_SQ, T.PLAN_SQ, T.PLAN_LOW_SQ, T.SCHDUL_SQ, T.CNFM_YN,
                   TO_CHAR(T.CNFM_DTS, 'yyyyMMdd') AS CNFM_DTS, TO_CHAR(T.DLVSH_DTS, 'yyyyMMdd') AS DLVSH_DTS,
                   T.PARTNER_CD, T.PARTNER_NM, T.ITEM_CD, T.ITEM_NM, T.SPCFCS_ITEM_NM, T.PR_RMK_DC, T.ORD_BBND_INFO_NM,
                   T.EQP_CD, T.EQP_NM, T.BBND_EQP_NM, T.PLAN_DT, T.WRK_TM_CNT, T.ORD_QT, T.ARLT_QT, T.REST_QT, T.WRK_UM, T.WRK_AMT,
                   T.PLTE_KND_CD, T.PLTE_KND_NM, T.FULL_PRPCNT_QT, T.FULL_PAGE_CNT, T.BBND_INFO_CD, T.BBND_INFO_NM, T.PACK_MTHD_CD, T.PACK_MTHD_NM,
                   T.PACK_UNIT_DC, T.PRPCNT_CLOSE_YN, T.SIZE_DC
            FROM (
                SELECT PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.ORDDOC_NO, PPIX.ORDDOC_SQ,
                       (SELECT CASE WHEN COUNT(*) = 0 THEN 'Y' ELSE 'N' END FROM PP_PLANPRW_INFO_X20329
                         WHERE COMPANY_CD = PPIX.COMPANY_CD AND PLANT_CD = PPIX.PLANT_CD AND PLAN_NO = PPIX.PLAN_NO AND PLAN_HIS_SQ = PPIX.PLAN_HIS_SQ
                           AND NVL(PRPCNT_CLOSE_YN, 'N') = 'N') AS PLANPRW_YN,
                       (SELECT CASE WHEN COUNT(*) = 0 THEN 'Y' ELSE 'N' END FROM PP_PLANBBND_INFO_X20329
                         WHERE COMPANY_CD = PPIX.COMPANY_CD AND PLANT_CD = PPIX.PLANT_CD AND PLAN_NO = PPIX.PLAN_NO AND PLAN_HIS_SQ = PPIX.PLAN_HIS_SQ
                           AND PLAN_LOW_SQ < 500 AND NVL(PRPCNT_CLOSE_YN, 'N') = 'N') AS PLANORGM_YN,
                       PPIX.ISSUE_YN,
                       CASE WHEN NVL(PPIX.ISSUE_YN, 'N') = 'Y' AND NVL(PPIX.PRPCNT_CLOSE_YN, 'N') = 'Y' THEN 'Y' ELSE 'N' END AS WRK_CD,
                       PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.SCHDUL_SQ, PPIX.CNFM_YN, SODX.CNFM_DTS, PPDX.DLVSH_DTS,
                       NVL(SOMX.PARTNER_CD, PPRM_X.PARTNER_CD) AS PARTNER_CD, CPM_SOMX.PARTNER_NM, PPIX.ITEM_CD, PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM, PPIX.PR_RMK_DC,
                       CASE WHEN NVL((SELECT COUNT(*) FROM SD_ORDBBND_DTL_X20329 SOBD
                                      WHERE SOBD.COMPANY_CD = PPIX.COMPANY_CD AND SOBD.PLANT_CD = PPIX.PLANT_CD AND SOBD.ORDDOC_NO = PPIX.ORDDOC_NO AND SOBD.ORDDOC_SQ = PPIX.ORDDOC_SQ), 0) > 0
                            THEN 'Y' ELSE 'N' END AS ORD_BBND_INFO_NM,
                       PPIX.EQP_CD, PES.EQP_NM,
                       CASE WHEN MEI.INOUTCOM_FG = '02' AND MWI.WC_FG_CD = '2' THEN CPM_PPDM.PARTNER_NM ELSE PES.EQP_NM END BBND_EQP_NM,
                       PPIX.PLAN_DT, PPIX.WRK_TM_CNT, PPIX.ORD_QT, PPIX.ARLT_QT, NVL(PPIX.ORD_QT, 0) - NVL(PPIX.ARLT_QT, 0) AS REST_QT, PPIX.WRK_UM, PPIX.WRK_AMT,
                       POIX.PLTE_KND_CD, MC5.SYSDEF_NM AS PLTE_KND_NM, PPIX.FULL_PRPCNT_QT, PPIX.FULL_PAGE_CNT,
                       SODX.BBND_INFO_CD, MC_BBND.SYSDEF_NM AS BBND_INFO_NM, SODX.PACK_MTHD_CD, MC_PACK.SYSDEF_NM AS PACK_MTHD_NM,
                       SODX.PACK_UNIT_DC, NVL(PPIX.PRPCNT_CLOSE_YN, 'N') AS PRPCNT_CLOSE_YN, SODX.HRZN_QT || ' x ' || SODX.VTCL_QT AS SIZE_DC
                FROM PP_PLANBBND_INFO_X20329 PPIX
                LEFT OUTER JOIN PM_EQ_DTL PED ON PED.COMPANY_CD = PPIX.COMPANY_CD AND PED.EQP_CD = PPIX.EQP_CD AND PED.PLANT_CD = PPIX.PLANT_CD
                LEFT OUTER JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = PPIX.COMPANY_CD AND PES.EQP_CD = PPIX.EQP_CD
                LEFT OUTER JOIN SD_ORDER_DTL_X20329 SODX ON SODX.COMPANY_CD = PPIX.COMPANY_CD AND SODX.PLANT_CD = PPIX.PLANT_CD AND SODX.ORDDOC_NO = PPIX.ORDDOC_NO AND SODX.ORDDOC_SQ = PPIX.ORDDOC_SQ
                LEFT OUTER JOIN SD_ORDER_MST_X20329 SOMX ON SOMX.COMPANY_CD = PPIX.COMPANY_CD AND SOMX.PLANT_CD = PPIX.PLANT_CD AND SOMX.ORDDOC_NO = PPIX.ORDDOC_NO
                LEFT OUTER JOIN PP_PREORD_MST_X20329 PPRM_X ON PPRM_X.COMPANY_CD = PPIX.COMPANY_CD AND PPRM_X.PLAN_ORD_NO = PPIX.ORDDOC_NO
                LEFT OUTER JOIN CI_PARTNER_MST CPM_SOMX ON CPM_SOMX.PARTNER_CD = NVL(SOMX.PARTNER_CD, PPRM_X.PARTNER_CD)
                LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON PPDX.COMPANY_CD = PPIX.COMPANY_CD AND PPDX.PLANT_CD = PPIX.PLANT_CD AND PPDX.PLAN_NO = PPIX.PLAN_NO
                                                       AND PPDX.PLAN_HIS_SQ = PPIX.PLAN_HIS_SQ AND PPDX.PLAN_SQ = PPIX.PLAN_SQ AND PPDX.ITEM_CD = PPIX.ITEM_CD
                LEFT OUTER JOIN ME_EQPCAPA_INFO MEI ON PPIX.COMPANY_CD = MEI.COMPANY_CD AND PPIX.PLANT_CD = MEI.PLANT_CD AND PPIX.EQP_CD = MEI.EQP_CD
                LEFT OUTER JOIN PP_OP_EQP_INFO POEI ON POEI.COMPANY_CD = MEI.COMPANY_CD AND POEI.PLANT_CD = MEI.PLANT_CD AND POEI.EQP_CD = MEI.EQP_CD
                LEFT OUTER JOIN PP_WCOP_MST PWM ON PWM.COMPANY_CD = POEI.COMPANY_CD AND PWM.PLANT_CD = POEI.PLANT_CD AND PWM.OP_CD = POEI.OP_CD
                LEFT OUTER JOIN MA_WRK_INFO MWI ON MWI.COMPANY_CD = PWM.COMPANY_CD AND MWI.PLANT_CD = PWM.PLANT_CD AND MWI.WC_CD = PWM.WC_CD
                -- 외주 발주처: 정본은 발주 라인(PP_PURORDER_DTL)을 그대로 조인해 라인이 여럿이면 제본 행이 그 수만큼 중복됐다(화면에 같은 행이 두 번) → (계획·순번·설비)당 하나로 묶는다
                LEFT OUTER JOIN (SELECT PPDL.COMPANY_CD, PPDL.PLANT_CD, PPDL.PLAN_NO, PPDL.PLAN_HIS_SQ, PPDL.PLAN_SQ, PPDL.EQP_CD, MAX(CPM.PARTNER_NM) AS PARTNER_NM
                                 FROM PP_PURORDER_DTL_X20329 PPDL
                                 INNER JOIN PP_PURORDER_MST_X20329 PPDM ON PPDM.COMPANY_CD = PPDL.COMPANY_CD AND PPDM.PLANT_CD = PPDL.PLANT_CD AND PPDM.PURDOC_NO = PPDL.PURDOC_NO
                                 LEFT OUTER JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = PPDM.PARTNER_CD
                                 WHERE PPDL.COMPANY_CD = '1000'
                                 GROUP BY PPDL.COMPANY_CD, PPDL.PLANT_CD, PPDL.PLAN_NO, PPDL.PLAN_HIS_SQ, PPDL.PLAN_SQ, PPDL.EQP_CD) CPM_PPDM
                             ON CPM_PPDM.COMPANY_CD = PPIX.COMPANY_CD AND CPM_PPDM.PLANT_CD = PPIX.PLANT_CD AND CPM_PPDM.PLAN_NO = PPIX.PLAN_NO
                            AND CPM_PPDM.PLAN_HIS_SQ = PPIX.PLAN_HIS_SQ AND CPM_PPDM.PLAN_SQ = PPIX.PLAN_SQ AND CPM_PPDM.EQP_CD = PPIX.EQP_CD
                LEFT OUTER JOIN PP_OPSTDPRI_INFO_X20329 POIX ON POIX.COMPANY_CD = PPIX.COMPANY_CD AND POIX.PLANT_CD = PPIX.PLANT_CD AND POIX.WRK_CD = PPIX.WRK_CD AND POIX.PARTNER_CD = '*'
                LEFT OUTER JOIN MA_CODEDTL MC5 ON MC5.COMPANY_CD = POIX.COMPANY_CD AND MC5.MODULE_CD = 'PP' AND MC5.FIELD_CD = 'Z008_20329' AND MC5.SYSDEF_CD = POIX.PLTE_KND_CD
                LEFT OUTER JOIN MA_CODEDTL MC_BBND ON MC_BBND.COMPANY_CD = SODX.COMPANY_CD AND MC_BBND.MODULE_CD = 'SD' AND MC_BBND.FIELD_CD = 'Z010_20329' AND MC_BBND.SYSDEF_CD = SODX.BBND_INFO_CD
                LEFT OUTER JOIN MA_CODEDTL MC_PACK ON MC_PACK.COMPANY_CD = SODX.COMPANY_CD AND MC_PACK.MODULE_CD = 'SD' AND MC_PACK.FIELD_CD = 'Z006_20329' AND MC_PACK.SYSDEF_CD = SODX.PACK_MTHD_CD
                WHERE PPIX.COMPANY_CD = '1000' AND PPIX.PLANT_CD = '1000'
                AND (NVL(PPIX.LAST_YN, 'N') = 'Y' OR NVL(PPIX.SUPP_YN, 'N') = 'Y')
                """ + COMMON_WHERE + """
            ) T
            ORDER BY T.PLAN_DT, T.SCHDUL_SQ, T.PLAN_NO
            """;

    // ───────────────────────────── 코팅 ─────────────────────────────
    private static final String COAT_SQL = """
            WITH PROCIX AS (
                SELECT PPPIX.COMPANY_CD, PPPIX.PLANT_CD, PPPIX.PLAN_NO, PPPIX.PLAN_HIS_SQ, PPPIX.PLAN_SQ,
                       LISTAGG(PPPIX.WRK_CD, '-') WITHIN GROUP (ORDER BY PLAN_NO, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ) AS WRK_CD,
                       LISTAGG(MC_WRK.SYSDEF_NM, '-') WITHIN GROUP (ORDER BY PLAN_NO, ORDDOC_NO, ORDDOC_SQ, PAGE_SQ, LINE_SQ) AS WRK_NM
                FROM PP_PLANPROCS_INFO_X20329 PPPIX
                LEFT OUTER JOIN MA_CODEDTL MC_WRK ON PPPIX.COMPANY_CD = MC_WRK.COMPANY_CD AND PPPIX.WRK_CD = MC_WRK.SYSDEF_CD AND MC_WRK.MODULE_CD = 'SD' AND MC_WRK.FIELD_CD = 'Z010_20329'
                GROUP BY PPPIX.COMPANY_CD, PPPIX.PLANT_CD, PPPIX.PLAN_NO, PPPIX.PLAN_HIS_SQ, PPPIX.PLAN_SQ
            )
            SELECT PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.SCHDUL_SQ, PPIX.ORDDOC_NO, PPIX.ORDDOC_SQ, PPIX.CNFM_YN,
                   PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM, PPIX.CONFIG_CD, MC_CONFIG.SYSDEF_NM AS CONFIG_NM, PPIX.PRPCNT_SQ,
                   PPIX.OP_CD, MC_OP.SYSDEF_NM AS OP_NM, PPIX.INTLTSH_CD, MC_INTLTSH.SYSDEF_NM AS INTLTSH_NM,
                   PPPIX.MTRIL_CD, CI.ITEM_NM AS MTRIL_NM, PPPIX.DTL_SIZE_DC, PPPIX.DTL_DC, PPIX.PROC_QT, PPPIX.NET_PPCNT_QT,
                   PPIX.WRK_CD, MC_WRK.SYSDEF_NM AS WRK_NM, PPIX.EQP_CD, PES1.EQP_NM, PPIX.PLAN_DT, PPIX.RMK_TXT AS PR_RMK_DC,
                   PPPIX.EQP_CD AS PRW_EQP_CD, PES.EQP_NM AS PRW_EQP_NM, NVL(PPPIX.PRPCNT_CLOSE_YN, 'N') AS PRPCNT_CLOSE_YN,
                   PROCIX.WRK_CD AS PROC_WRK_CD, PROCIX.WRK_NM AS PROC_WRK_NM,
                   SUM(NVL(PPI.PROD_QT, 0)) AS PROD_QT, NVL(PPPIX.NET_PPCNT_QT, 0) - SUM(NVL(PPI.PROD_QT, 0)) AS RE_QT,
                   PPIX.WRK_UM, PPIX.WRK_AMT, PPB.BND_PARTNER_NM, MEI2.INOUTCOM_FG, PPIX.ISSUE_YN, PPPIX.PLAN_DT AS PRW_PLAN_DT
            FROM PP_PLANPROCS_INFO_X20329 PPIX
            LEFT OUTER JOIN PM_EQ_DTL PED ON PED.COMPANY_CD = PPIX.COMPANY_CD AND PED.EQP_CD = PPIX.EQP_CD AND PED.PLANT_CD = PPIX.PLANT_CD
            LEFT OUTER JOIN PM_EQ_SDTL PES1 ON PES1.COMPANY_CD = PPIX.COMPANY_CD AND PES1.EQP_CD = PPIX.EQP_CD AND PES1.LANG_CD = 'KO'
            LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX ON PPIX.COMPANY_CD = PPDX.COMPANY_CD AND PPIX.PLAN_NO = PPDX.PLAN_NO AND PPIX.PLAN_HIS_SQ = PPDX.PLAN_HIS_SQ AND PPIX.PLAN_SQ = PPDX.PLAN_SQ
            LEFT OUTER JOIN MA_CODEDTL MC_CONFIG ON PPIX.COMPANY_CD = MC_CONFIG.COMPANY_CD AND PPIX.CONFIG_CD = MC_CONFIG.SYSDEF_CD AND MC_CONFIG.MODULE_CD = 'SD' AND MC_CONFIG.FIELD_CD = 'Z007_20329'
            LEFT OUTER JOIN MA_CODEDTL MC_OP ON MC_OP.COMPANY_CD = PPIX.COMPANY_CD AND MC_OP.MODULE_CD = 'PP' AND MC_OP.FIELD_CD = 'Z005_20329' AND MC_OP.SYSDEF_CD = PPIX.OP_CD
            LEFT OUTER JOIN MA_CODEDTL MC_WRK ON MC_WRK.COMPANY_CD = PPIX.COMPANY_CD AND MC_WRK.MODULE_CD = 'SD' AND MC_WRK.FIELD_CD = 'Z010_20329' AND MC_WRK.SYSDEF_CD = PPIX.WRK_CD
            LEFT OUTER JOIN MA_CODEDTL MC_INTLTSH ON MC_INTLTSH.COMPANY_CD = PPIX.COMPANY_CD AND MC_INTLTSH.MODULE_CD = 'PP' AND MC_INTLTSH.FIELD_CD = 'Z002_20329' AND MC_INTLTSH.SYSDEF_CD = PPIX.INTLTSH_CD
            LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPPIX ON PPIX.COMPANY_CD = PPPIX.COMPANY_CD AND PPIX.PLANT_CD = PPPIX.PLANT_CD AND PPIX.KEY_VAL_NM = PPPIX.KEY_VAL_NM
            LEFT OUTER JOIN CI_ITEM CI ON CI.ITEM_CD = PPPIX.MTRIL_CD
            LEFT OUTER JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = PPPIX.COMPANY_CD AND PES.EQP_CD = PPPIX.EQP_CD AND PES.LANG_CD = 'KO'
            LEFT OUTER JOIN PROCIX PROCIX ON PPPIX.COMPANY_CD = PROCIX.COMPANY_CD AND PPPIX.PLANT_CD = PROCIX.PLANT_CD AND PPPIX.PLAN_NO = PROCIX.PLAN_NO
                                         AND PPPIX.PLAN_HIS_SQ = PROCIX.PLAN_HIS_SQ AND PPPIX.PLAN_SQ = PROCIX.PLAN_SQ
            LEFT OUTER JOIN """ + BIND_PARTNER_SUB.replace("%BND_RANGE%", "") + """
                         ON PPPIX.COMPANY_CD = PPB.COMPANY_CD AND PPPIX.PLAN_NO = PPB.PLAN_NO AND PPPIX.PLAN_SQ = PPB.PLAN_SQ AND PPPIX.ITEM_CD = PPB.BAN_ITEM_CD
            LEFT OUTER JOIN ME_EQPCAPA_INFO MEI2 ON PPIX.COMPANY_CD = MEI2.COMPANY_CD AND PPIX.PLANT_CD = MEI2.PLANT_CD AND PPIX.EQP_CD = MEI2.EQP_CD
            LEFT OUTER JOIN PP_PROD_IF PPI ON PPIX.COMPANY_CD = PPI.COMPANY_CD AND PPIX.PLANT_CD = PPI.PLANT_CD AND PPIX.PLAN_NO = PPI.SODOC_NO AND PPIX.PLAN_SQ = PPI.SODOC_SQ
                                          AND PPIX.PLAN_LOW_SQ = PPI.INTL_NO AND PPIX.BAN_ITEM_CD = PPI.ITEM_CD
                                          AND PPI.INTL_SYS_CD IN ('MES', 'OSC') AND PPI.CRUD_FG = 'I' AND PPI.INTL_ST = '2' AND PPI.REL1_CD = 'WC30'
            WHERE PPIX.COMPANY_CD = '1000' AND PPIX.PLANT_CD = '1000'
            """ + COMMON_WHERE + """
            GROUP BY PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.SCHDUL_SQ, PPIX.ORDDOC_NO, PPIX.ORDDOC_SQ, PPIX.CNFM_YN,
                     PPDX.ITEM_NM, PPDX.SPCFCS_ITEM_NM, PPIX.CONFIG_CD, MC_CONFIG.SYSDEF_NM, PPIX.PRPCNT_SQ, PPIX.OP_CD, MC_OP.SYSDEF_NM, PPIX.INTLTSH_CD, MC_INTLTSH.SYSDEF_NM,
                     PPPIX.MTRIL_CD, CI.ITEM_NM, PPPIX.DTL_SIZE_DC, PPPIX.DTL_DC, PPIX.PROC_QT, PPPIX.NET_PPCNT_QT, PPIX.WRK_CD, MC_WRK.SYSDEF_NM, PPIX.EQP_CD, PES1.EQP_NM,
                     PPIX.PLAN_DT, PPIX.RMK_TXT, PPPIX.EQP_CD, PES.EQP_NM, PPPIX.PRPCNT_CLOSE_YN, PROCIX.WRK_CD, PROCIX.WRK_NM, PPIX.WRK_UM, PPIX.WRK_AMT,
                     PPB.BND_PARTNER_NM, MEI2.INOUTCOM_FG, PPIX.ISSUE_YN, PPPIX.PLAN_DT
            ORDER BY PPIX.PLAN_DT, PPIX.SCHDUL_SQ, PPIX.COMPANY_CD, PPIX.PLANT_CD, PPIX.PLAN_NO, PPIX.PLAN_HIS_SQ, PPIX.PLAN_SQ, PPIX.CONFIG_CD
            """;

    /**
     * 계획일 기간 양끝 포함. eqpTp 가 null 이면 설비 유형 전체, 검색어는 LIKE(비면 전체).
     * 바인드 변수로 둔다 — 기간·설비유형을 리터럴로 박아 봤더니(2026-10-06) ERP 실행계획이 더 나빠져 1주 조회가 3회 연속 180초 타임아웃.
     * 바인드면 14초 안팎. ERP 캐시 상태에 따라 4초~수 분까지 흔들리므로 더 손대지 않는다.
     */
    public List<Map<String, Object>> findRows(Tab tab, LocalDate start, LocalDate end, String eqpTp, String planNo, String orderNo) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("start", start.format(BASIC)).addValue("end", end.format(BASIC))
                .addValue("eqpTp", eqpTp == null || eqpTp.isBlank() ? null : eqpTp, java.sql.Types.VARCHAR)
                .addValue("planNo", planNo == null ? "" : planNo).addValue("orderNo", orderNo == null ? "" : orderNo);
        if (tab == Tab.PRINT) return findPrintRows(p);
        return jdbc.query(tab == Tab.BIND ? BIND_SQL : COAT_SQL, p, this::map);
    }

    private Map<String, Object> map(ResultSet rs, int i) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int c = 1; c <= md.getColumnCount(); c++) {
            Object v = rs.getObject(c);
            if (v instanceof String str) v = str.trim();
            if (v instanceof java.sql.Timestamp ts) v = ts.toLocalDateTime().toLocalDate().toString();
            row.put(OracleEquipmentPerfRepository.camel(md.getColumnLabel(c).toUpperCase(Locale.ROOT)), v);
        }
        return row;
    }
}
