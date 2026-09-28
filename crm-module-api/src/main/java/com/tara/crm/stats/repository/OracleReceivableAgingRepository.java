package com.tara.crm.stats.repository;

import com.tara.crm.stats.dto.ReceivableAgingDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 채권연령분석 — 더존 채권원장(FI_BAN_MST) 기준 사업부별 미수채권 잔액과 연령버킷.
 *
 * <h3>사업부 = 계정 (2026-09-28 회계 확인)</h3>
 * 사업부는 회계단위(PC_CD)가 아니라 외상매출금 하위 계정으로 가른다. 회계단위는 묻지 않는다.
 * <ul>
 *   <li>TPS(파주본부) = 10801 국내외상매출금</li>
 *   <li>GRP(그래픽스본부) = 10805 그래픽스외상매출금</li>
 *   <li>PM(PM본부) = 10804 PM사업외상매출금</li>
 * </ul>
 * 해외외상매출금(10802)·기타(10803·10806·10807)는 넣지 않는다. 예전 코드는 "10801 아래 계층 전부"라고 적었지만
 * 10801 은 하위 계정이 없는 단일 계정이라(상위는 10800) 그래픽스·PM 이 통째로 빠졌었다.
 *
 * <h3>기준일 잔액</h3>
 * FI_BAN_MST.BAN_AMT 는 "지금까지" 반제된 누계라 그대로 쓰면 과거 기준일에도 오늘 잔액이 나온다.
 * 그래서 기준일 잔액 = (DOCU_AMT − BAN_AMT) + 기준일 뒤에 반제된 금액(FI_BAN_DTL.BAN_DT &gt; 기준일), 대상은 회계일 ≤ 기준일 전표.
 * 오늘 이후 기준일이면 더해지는 금액이 0 이라 더존 현잔액과 같다. 반제 상세는 2025-01-01 부터 있으므로
 * 그 이전 기준일은 정확하지 않다. 2024-12-31 기초이월 전표 일부는 반제 상세 합계가 BAN_AMT 와 다르다(2025년 초 기준일에 수천만 원 단위 오차).
 *
 * <h3>연령</h3>
 * 회계일(ACTG_DT, yyyyMMdd)을 기준일에서 거꾸로 30일 단위로 나눈다. 대상이 전부 회계일 ≤ 기준일이라 다섯 버킷 합 = 잔액.
 */
@Repository
@RequiredArgsConstructor
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleReceivableAgingRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;
    private static final String COMPANY_CD = "1000";
    private static final String GAAP_CD = "2";

    /** 사업부 키 → 계정코드. 순서가 화면 표시 순서. */
    public static final Map<String, String> DIVISION_ACCOUNTS = new LinkedHashMap<>();
    static {
        DIVISION_ACCOUNTS.put("TPS", "10801");
        DIVISION_ACCOUNTS.put("GRP", "10805");
        DIVISION_ACCOUNTS.put("PM", "10804");
    }

    /** CASE ACCT_CD WHEN '10801' THEN 'TPS' ... END — 상수라 바인딩하지 않고 SQL 에 박는다. */
    private static final String DIVISION_CASE;
    private static final String ACCOUNT_IN;
    static {
        StringBuilder c = new StringBuilder("CASE FBM.ACCT_CD");
        List<String> accts = new ArrayList<>();
        DIVISION_ACCOUNTS.forEach((div, acct) -> {
            c.append(" WHEN '").append(acct).append("' THEN '").append(div).append("'");
            accts.add("'" + acct + "'");
        });
        DIVISION_CASE = c.append(" END").toString();
        ACCOUNT_IN = String.join(",", accts);
    }

    /**
     * 기준일 시점 미반제 전표 줄(사업부·계정·거래처 단위). 공통 FROM 절.
     * 바인딩: COMPANY_CD, base(반제 이후), COMPANY_CD, GAAP_CD, base(회계일 상한).
     */
    private static final String ASOF_LINES = """
            WITH AFTER_BAN AS (
                SELECT DOCU_NO, DOLINE_SQ, SUM(DOCU_AMT) AS AFTER_AMT
                  FROM FI_BAN_DTL
                 WHERE COMPANY_CD = ? AND BAN_DT > ?
                 GROUP BY DOCU_NO, DOLINE_SQ
            ),
            LINES AS (
                SELECT FBM.PC_CD, %s AS DIVISION, FBM.WRT_DEPT_CD, FDM.WRT_EMP_NO, FBM.PARTNER_CD, FBM.ACCT_CD, FBM.ACTG_DT,
                       FBM.DOCU_AMT - FBM.BAN_AMT + NVL(AB.AFTER_AMT, 0) AS AMT
                  FROM FI_BAN_MST FBM
                 INNER JOIN FI_DOCU_MST FDM
                    ON FDM.COMPANY_CD = FBM.COMPANY_CD AND FDM.PC_CD = FBM.PC_CD AND FDM.DOCU_NO = FBM.DOCU_NO
                  LEFT JOIN AFTER_BAN AB
                    ON AB.DOCU_NO = FBM.DOCU_NO AND AB.DOLINE_SQ = FBM.DOLINE_SQ
                 WHERE FBM.COMPANY_CD = ?
                   AND FDM.GAAP_CD = ?
                   AND FBM.ACCT_CD IN (%s)
                   AND FBM.ACTG_DT <= ?
            )
            """.formatted(DIVISION_CASE, ACCOUNT_IN);

    public List<ReceivableAgingDto.Row> findRows(LocalDate baseDate) {
        String base = baseDate.format(BASIC);
        String d30 = baseDate.minusDays(29).format(BASIC);
        String d60 = baseDate.minusDays(59).format(BASIC);
        String d90 = baseDate.minusDays(89).format(BASIC);
        String d120 = baseDate.minusDays(119).format(BASIC);
        String d30Prev = baseDate.minusDays(30).format(BASIC);
        String d60Prev = baseDate.minusDays(60).format(BASIC);
        String d90Prev = baseDate.minusDays(90).format(BASIC);

        String sql = ASOF_LINES + """
            , BAN AS (
                SELECT PC_CD, DIVISION, WRT_DEPT_CD, WRT_EMP_NO, PARTNER_CD, ACCT_CD,
                       SUM(AMT) AS AM_HJAN,
                       SUM(CASE WHEN ACTG_DT BETWEEN ? AND ? THEN AMT ELSE 0 END) AS IN_DAY_30,
                       SUM(CASE WHEN ACTG_DT BETWEEN ? AND ? THEN AMT ELSE 0 END) AS IN_DAY_60,
                       SUM(CASE WHEN ACTG_DT BETWEEN ? AND ? THEN AMT ELSE 0 END) AS IN_DAY_90,
                       SUM(CASE WHEN ACTG_DT BETWEEN ? AND ? THEN AMT ELSE 0 END) AS IN_DAY_120,
                       SUM(CASE WHEN ACTG_DT < ? THEN AMT ELSE 0 END) AS OUT_DAY_121
                  FROM LINES
                 GROUP BY PC_CD, DIVISION, WRT_DEPT_CD, WRT_EMP_NO, PARTNER_CD, ACCT_CD
            )
            SELECT B.PC_CD, MPM.PC_NM, B.DIVISION,
                   B.WRT_DEPT_CD, MDM.DEPT_NM AS WRT_DEPT_NM,
                   B.WRT_EMP_NO, HEM.KOR_NM AS WRT_KOR_NM,
                   B.PARTNER_CD, CPM.PARTNER_NM, CPM.BIZR_NO,
                   MPAYM.TERPAY_CD, MPAYM.TERPAY_NM,
                   B.ACCT_CD, MCM.ACCT_NM,
                   B.AM_HJAN, B.IN_DAY_30, B.IN_DAY_60, B.IN_DAY_90, B.IN_DAY_120, B.OUT_DAY_121
              FROM BAN B
              LEFT JOIN MA_PC_MST MPM ON MPM.COMPANY_CD = ? AND MPM.PC_CD = B.PC_CD
              LEFT JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = ? AND MDM.DEPT_CD = B.WRT_DEPT_CD
              LEFT JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = ? AND HEM.EMP_NO = B.WRT_EMP_NO
              LEFT JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = B.PARTNER_CD
              LEFT JOIN MA_PARTNER_MST MPARTM ON MPARTM.COMPANY_CD = ? AND MPARTM.PARTNER_CD = B.PARTNER_CD
              LEFT JOIN MA_PAYMENT_MST MPAYM ON MPAYM.COMPANY_CD = MPARTM.COMPANY_CD AND MPAYM.TERPAY_CD = MPARTM.CMNY_COND_CD
              LEFT JOIN MA_COA_MST MCM ON MCM.COMPANY_CD = ? AND MCM.GAAP_CD = ? AND MCM.ACCT_CD = B.ACCT_CD
             WHERE (B.AM_HJAN <> 0 OR B.IN_DAY_30 <> 0 OR B.IN_DAY_60 <> 0 OR B.IN_DAY_90 <> 0 OR B.IN_DAY_120 <> 0 OR B.OUT_DAY_121 <> 0)
             ORDER BY B.DIVISION, B.PC_CD, B.WRT_DEPT_CD, B.WRT_EMP_NO, B.PARTNER_CD, B.ACCT_CD
            """;

        List<Object> args = asOfArgs(base);
        // 버킷
        args.add(d30); args.add(base);
        args.add(d60); args.add(d30Prev);
        args.add(d90); args.add(d60Prev);
        args.add(d120); args.add(d90Prev);
        args.add(d120);
        // 명칭 조인
        args.add(COMPANY_CD); args.add(COMPANY_CD); args.add(COMPANY_CD); args.add(COMPANY_CD);
        args.add(COMPANY_CD); args.add(GAAP_CD);

        return jdbcTemplate.query(sql, (rs, i) -> ReceivableAgingDto.Row.builder()
                .pcCd(trim(rs.getString("PC_CD")))
                .pcNm(trim(rs.getString("PC_NM")))
                .division(trim(rs.getString("DIVISION")))
                .wrtDeptCd(trim(rs.getString("WRT_DEPT_CD")))
                .wrtDeptNm(trim(rs.getString("WRT_DEPT_NM")))
                .wrtEmpNo(trim(rs.getString("WRT_EMP_NO")))
                .wrtKorNm(trim(rs.getString("WRT_KOR_NM")))
                .partnerCd(trim(rs.getString("PARTNER_CD")))
                .partnerNm(trim(rs.getString("PARTNER_NM")))
                .bizrNo(trim(rs.getString("BIZR_NO")))
                .terpayCd(trim(rs.getString("TERPAY_CD")))
                .terpayNm(trim(rs.getString("TERPAY_NM")))
                .acctCd(trim(rs.getString("ACCT_CD")))
                .acctNm(trim(rs.getString("ACCT_NM")))
                .amHjan(nz(rs.getBigDecimal("AM_HJAN")))
                .inDay30(nz(rs.getBigDecimal("IN_DAY_30")))
                .inDay60(nz(rs.getBigDecimal("IN_DAY_60")))
                .inDay90(nz(rs.getBigDecimal("IN_DAY_90")))
                .inDay120(nz(rs.getBigDecimal("IN_DAY_120")))
                .outDay121(nz(rs.getBigDecimal("OUT_DAY_121")))
                .build(), args.toArray());
    }

    /** 기준일 시점 사업부별 잔액 합계만 — 전년 같은 날 비교용. 사업부 키 순서는 DIVISION_ACCOUNTS 와 같고 없는 사업부는 0. */
    public Map<String, BigDecimal> findDivisionTotals(LocalDate baseDate) {
        String sql = ASOF_LINES + " SELECT DIVISION, SUM(AMT) AS AMT FROM LINES GROUP BY DIVISION";
        Map<String, BigDecimal> out = new LinkedHashMap<>();
        DIVISION_ACCOUNTS.keySet().forEach(k -> out.put(k, BigDecimal.ZERO));
        jdbcTemplate.query(sql, rs -> {
            out.put(trim(rs.getString("DIVISION")), nz(rs.getBigDecimal("AMT")));
        }, asOfArgs(baseDate.format(BASIC)).toArray());
        return out;
    }

    private static List<Object> asOfArgs(String base) {
        List<Object> args = new ArrayList<>();
        args.add(COMPANY_CD); args.add(base);            // AFTER_BAN
        args.add(COMPANY_CD); args.add(GAAP_CD); args.add(base);  // LINES
        return args;
    }

    private static String trim(String s) { return s == null ? null : s.trim(); }
    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
}
