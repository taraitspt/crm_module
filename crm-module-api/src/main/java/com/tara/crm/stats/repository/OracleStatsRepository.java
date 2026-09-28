package com.tara.crm.stats.repository;

import com.tara.crm.stats.dto.RecentOrderDto;
import com.tara.crm.stats.dto.SalesTrendDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Repository
@RequiredArgsConstructor
public class OracleStatsRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    private static final Map<String, String> STATUS_LABEL_MAP = Map.of(
            "100", "접수대기", "200", "확정", "300", "출하", "400", "완료", "900", "취소"
    );

    /** 당월 매출 합계 (Oracle SD_BILL_MST) */
    public long getMonthlySalesTotal(int year, int month) {
        String startDt = String.format("%04d%02d01", year, month);
        String endDt;
        if (month == 12) {
            endDt = String.format("%04d0101", year + 1);
        } else {
            endDt = String.format("%04d%02d01", year, month + 1);
        }
        Long result = jdbcTemplate.queryForObject(
                """
                SELECT COALESCE(SUM(SPLY_AMT), 0) FROM SD_BILL_MST
                 WHERE COMPANY_CD = '1000' AND BILL_DT >= ? AND BILL_DT < ?
                """,
                Long.class, startDt, endDt
        );
        return result != null ? result : 0L;
    }

    /** 당월 신규 주문 건수 (Oracle SD_ORDER_MST_X20329) */
    public int getNewOrderCount(int year, int month) {
        String startDt = String.format("%04d%02d01", year, month);
        String endDt;
        if (month == 12) {
            endDt = String.format("%04d0101", year + 1);
        } else {
            endDt = String.format("%04d%02d01", year, month + 1);
        }
        Integer result = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM SD_ORDER_MST_X20329
                 WHERE COMPANY_CD = '1000' AND ORD_DT >= ? AND ORD_DT < ?
                """,
                Integer.class, startDt, endDt
        );
        return result != null ? result : 0;
    }

    /** 활성 거래처 수 (최근 N개월) */
    public int getActiveCustomerCount(LocalDate since) {
        Integer result = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(DISTINCT PARTNER_CD) FROM SD_ORDER_MST_X20329
                 WHERE COMPANY_CD = '1000' AND ORD_DT >= ?
                """,
                Integer.class, since.format(BASIC)
        );
        return result != null ? result : 0;
    }

    /** 최근 주문 목록 */
    public List<RecentOrderDto> getRecentOrders(int limit) {
        return jdbcTemplate.query(
                """
                SELECT o.ORDDOC_NO,
                       COALESCE(
                         (SELECT p.PARTNER_NM FROM CI_PARTNER_MST p
                           WHERE p.PARTNER_CD = o.PARTNER_CD AND ROWNUM = 1),
                         o.ORDDOC_NM
                       ) AS PARTNER_NM,
                       (SELECT SUM(d.SUM_AMT) FROM SD_ORDER_DTL_X20329 d
                         WHERE d.COMPANY_CD = o.COMPANY_CD AND d.ORDDOC_NO = o.ORDDOC_NO) AS TOTAL_AMT,
                       o.WRK_FG,
                       o.INSERT_DTS
                  FROM SD_ORDER_MST_X20329 o
                 WHERE o.COMPANY_CD = '1000'
                   AND o.PLAN_PLANT_CD = '2000'
                 ORDER BY o.INSERT_DTS DESC, o.ORDDOC_NO DESC
                 FETCH FIRST ? ROWS ONLY
                """,
                (rs, rowNum) -> {
                    String wrkFg = rs.getString("WRK_FG");
                    String status = mapWrkFg(wrkFg);
                    return RecentOrderDto.builder()
                            .orderNo(rs.getString("ORDDOC_NO"))
                            .customerName(rs.getString("PARTNER_NM"))
                            .totalAmount(rs.getLong("TOTAL_AMT"))
                            .status(status)
                            .statusLabel(STATUS_LABEL_MAP.getOrDefault(wrkFg, status))
                            .createdAt(rs.getTimestamp("INSERT_DTS") != null
                                    ? rs.getTimestamp("INSERT_DTS").toLocalDateTime() : null)
                            .build();
                },
                limit
        );
    }

    /** 월별 매출 추이 */
    public List<SalesTrendDto.MonthlyAmount> getMonthlySalesTrend(LocalDate startDate, LocalDate endDate) {
        return jdbcTemplate.query(
                """
                SELECT SUBSTR(BILL_DT, 1, 4) || '-' || SUBSTR(BILL_DT, 5, 2) AS MONTH_KEY,
                       SUM(SPLY_AMT) AS TOTAL
                  FROM SD_BILL_MST
                 WHERE COMPANY_CD = '1000' AND BILL_DT >= ? AND BILL_DT <= ?
                 GROUP BY SUBSTR(BILL_DT, 1, 4) || '-' || SUBSTR(BILL_DT, 5, 2)
                 ORDER BY MONTH_KEY
                """,
                (rs, rowNum) -> SalesTrendDto.MonthlyAmount.builder()
                        .month(rs.getString("MONTH_KEY"))
                        .amount(rs.getLong("TOTAL"))
                        .build(),
                startDate.format(BASIC), endDate.format(BASIC)
        );
    }

    /** 품목별 실적 */
    public List<Object[]> getItemPerformance(LocalDate startDate, LocalDate endDate) {
        return jdbcTemplate.query(
                """
                SELECT d.ITEM_FG AS CATEGORY, SUM(d.SUM_AMT) AS TOTAL_AMT, COUNT(*) AS CNT
                  FROM SD_ORDER_DTL_X20329 d
                  JOIN SD_ORDER_MST_X20329 o ON o.COMPANY_CD = d.COMPANY_CD AND o.ORDDOC_NO = d.ORDDOC_NO
                 WHERE d.COMPANY_CD = '1000'
                   AND o.ORD_DT >= ? AND o.ORD_DT <= ?
                   AND d.ITEM_FG IS NOT NULL
                 GROUP BY d.ITEM_FG
                 ORDER BY TOTAL_AMT DESC
                """,
                (rs, rowNum) -> new Object[]{rs.getString("CATEGORY"), rs.getLong("TOTAL_AMT"), rs.getInt("CNT")},
                startDate.format(BASIC), endDate.format(BASIC)
        );
    }

    /** 본부/팀별 예상매출 (Oracle) */
    public List<Object[]> getTeamForecast(int year, int month) {
        String startDt = String.format("%04d%02d01", year, month);
        String endDt;
        if (month == 12) {
            endDt = String.format("%04d0101", year + 1);
        } else {
            endDt = String.format("%04d%02d01", year, month + 1);
        }
        return jdbcTemplate.query(
                """
                SELECT (SELECT d.DEPT_NM FROM VW_MA_DEPT_MST d
                         WHERE d.COMPANY_CD = '1000' AND d.DEPT_CD = o.DEPT_CD AND ROWNUM = 1) AS DEPT_NM,
                       o.WRK_FG,
                       SUM((SELECT COALESCE(SUM(dt.SUM_AMT), 0) FROM SD_ORDER_DTL_X20329 dt
                            WHERE dt.COMPANY_CD = o.COMPANY_CD AND dt.ORDDOC_NO = o.ORDDOC_NO)) AS TOTAL_AMT
                  FROM SD_ORDER_MST_X20329 o
                 WHERE o.COMPANY_CD = '1000'
                   AND o.ORD_DT >= ? AND o.ORD_DT < ?
                 GROUP BY o.DEPT_CD, o.WRK_FG
                 ORDER BY DEPT_NM
                """,
                (rs, rowNum) -> new Object[]{
                    rs.getString("DEPT_NM"),
                    rs.getString("WRK_FG"),
                    rs.getLong("TOTAL_AMT")
                },
                startDt, endDt
        );
    }

    /** 부서별 월별 매출 실적 (Oracle SD_BILL_MST + SD_BILL_DTL) */
    public List<Object[]> getMonthlySalesActualByDept(int year) {
        String startDt = String.format("%04d0101", year);
        String endDt = String.format("%04d0101", year + 1);
        return jdbcTemplate.query(
                """
                SELECT (SELECT d2.DEPT_NM FROM VW_MA_DEPT_MST d2
                         WHERE d2.COMPANY_CD = '1000' AND d2.DEPT_CD = dt.SALESORGN_CD AND ROWNUM = 1) AS DEPT_NM,
                       TO_NUMBER(SUBSTR(b.BILL_DT, 5, 2)) AS BILL_MONTH,
                       SUM(dt.TRAN_AMT) AS TOTAL_AMT
                  FROM SD_BILL_MST b
                  JOIN SD_BILL_DTL dt ON dt.COMPANY_CD = b.COMPANY_CD AND dt.BILLDOC_NO = b.BILLDOC_NO
                 WHERE b.COMPANY_CD = '1000'
                   AND b.BILL_DT >= ? AND b.BILL_DT < ?
                 GROUP BY dt.SALESORGN_CD, SUBSTR(b.BILL_DT, 5, 2)
                 ORDER BY DEPT_NM, BILL_MONTH
                """,
                (rs, rowNum) -> new Object[]{
                    rs.getString("DEPT_NM"),
                    rs.getInt("BILL_MONTH"),
                    rs.getLong("TOTAL_AMT")
                },
                startDt, endDt
        );
    }

    /** 연도별 거래처·영업담당부서·월 매출(공급가액) 집계. */
    public List<Object[]> getCustomerYearlySales(int year, String departmentCd, String partnerCd, String plantCd) {
        String startDt = String.format("%04d0101", year);
        String endDt = String.format("%04d0101", year + 1);
        StringBuilder sql = new StringBuilder("""
                SELECT x.PARTNER_CD,
                       NVL((SELECT p.PARTNER_NM FROM CI_PARTNER_MST p
                             WHERE p.PARTNER_CD = x.PARTNER_CD
                               AND ROWNUM = 1), x.PARTNER_CD) AS PARTNER_NM,
                       x.DEPT_CD,
                       NVL((SELECT d.DEPT_NM FROM VW_MA_DEPT_MST d
                             WHERE d.COMPANY_CD = '1000' AND d.DEPT_CD = x.DEPT_CD
                               AND ROWNUM = 1), x.DEPT_CD) AS DEPT_NM,
                       x.BILL_MONTH,
                       x.TOTAL_AMT
                  FROM (
                        SELECT b.SALEPRTN_CD AS PARTNER_CD,
                               dt.SALESORGN_CD AS DEPT_CD,
                               TO_NUMBER(SUBSTR(b.BILL_DT, 5, 2)) AS BILL_MONTH,
                               SUM(NVL(dt.TRAN_AMT, 0)) AS TOTAL_AMT
                          FROM SD_BILL_MST b
                          JOIN SD_BILL_DTL dt
                            ON dt.COMPANY_CD = b.COMPANY_CD
                           AND dt.BILLDOC_NO = b.BILLDOC_NO
                         WHERE b.COMPANY_CD = '1000'
                           AND b.BILL_DT >= ? AND b.BILL_DT < ?
                """);
        List<Object> params = new ArrayList<>();
        params.add(startDt);
        params.add(endDt);
        if (departmentCd != null && !departmentCd.isBlank()) {
            sql.append(" AND dt.SALESORGN_CD = ?");
            params.add(departmentCd.trim());
        }
        if (partnerCd != null && !partnerCd.isBlank()) {
            sql.append(" AND b.SALEPRTN_CD = ?");
            params.add(partnerCd.trim());
        }
        // 사업부문(1000 타라티피에스 / 2000 그래픽스 / 3000 PM). 비우면 전체.
        if (plantCd != null && !plantCd.isBlank()) {
            sql.append(" AND dt.PLANT_CD = ?");
            params.add(plantCd.trim());
        }
        sql.append("""
                         GROUP BY b.SALEPRTN_CD, dt.SALESORGN_CD, SUBSTR(b.BILL_DT, 5, 2)
                       ) x
                 ORDER BY PARTNER_NM, DEPT_NM, BILL_MONTH
                """);
        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new Object[]{
                rs.getString("PARTNER_CD"), rs.getString("PARTNER_NM"),
                rs.getString("DEPT_CD"), rs.getString("DEPT_NM"),
                rs.getInt("BILL_MONTH"), rs.getLong("TOTAL_AMT")
        }, params.toArray());
    }

    public List<Object[]> getCustomerYearlySalesDepartments(int year) {
        String startDt = String.format("%04d0101", year);
        String endDt = String.format("%04d0101", year + 1);
        return jdbcTemplate.query("""
                SELECT DISTINCT dt.SALESORGN_CD AS DEPT_CD,
                       NVL((SELECT d.DEPT_NM FROM VW_MA_DEPT_MST d
                             WHERE d.COMPANY_CD = '1000' AND d.DEPT_CD = dt.SALESORGN_CD
                               AND ROWNUM = 1), dt.SALESORGN_CD) AS DEPT_NM
                  FROM SD_BILL_MST b
                  JOIN SD_BILL_DTL dt ON dt.COMPANY_CD = b.COMPANY_CD AND dt.BILLDOC_NO = b.BILLDOC_NO
                 WHERE b.COMPANY_CD = '1000' AND b.BILL_DT >= ? AND b.BILL_DT < ?
                   AND dt.SALESORGN_CD IS NOT NULL
                 ORDER BY DEPT_NM
                """, (rs, rowNum) -> new Object[]{rs.getString("DEPT_CD"), rs.getString("DEPT_NM")},
                startDt, endDt);
    }

    public List<Object[]> getCustomerYearlySalesPartners(int year) {
        String startDt = String.format("%04d0101", year);
        String endDt = String.format("%04d0101", year + 1);
        return jdbcTemplate.query("""
                SELECT DISTINCT b.SALEPRTN_CD AS PARTNER_CD,
                       NVL((SELECT p.PARTNER_NM FROM CI_PARTNER_MST p
                             WHERE p.PARTNER_CD = b.SALEPRTN_CD
                               AND ROWNUM = 1), b.SALEPRTN_CD) AS PARTNER_NM
                  FROM SD_BILL_MST b
                 WHERE b.COMPANY_CD = '1000' AND b.BILL_DT >= ? AND b.BILL_DT < ?
                   AND b.SALEPRTN_CD IS NOT NULL
                 ORDER BY PARTNER_NM
                """, (rs, rowNum) -> new Object[]{rs.getString("PARTNER_CD"), rs.getString("PARTNER_NM")},
                startDt, endDt);
    }

    /** 품목별 실적 (Oracle SD_ORDER_DTL_X20329) - ITEM_FG 기반 */
    public List<Object[]> getItemPerformanceOracle(LocalDate startDate, LocalDate endDate) {
        return jdbcTemplate.query(
                """
                SELECT d.ITEM_FG AS CATEGORY,
                       SUM(d.SUM_AMT) AS TOTAL_AMT,
                       COUNT(DISTINCT d.ORDDOC_NO) AS ORDER_COUNT
                  FROM SD_ORDER_DTL_X20329 d
                  JOIN SD_ORDER_MST_X20329 o ON o.COMPANY_CD = d.COMPANY_CD AND o.ORDDOC_NO = d.ORDDOC_NO
                 WHERE d.COMPANY_CD = '1000'
                   AND o.ORD_DT >= ? AND o.ORD_DT <= ?
                 GROUP BY d.ITEM_FG
                 ORDER BY TOTAL_AMT DESC
                """,
                (rs, rowNum) -> new Object[]{
                    rs.getString("CATEGORY"),
                    rs.getLong("TOTAL_AMT"),
                    rs.getInt("ORDER_COUNT")
                },
                startDate.format(BASIC), endDate.format(BASIC)
        );
    }

    /** 기간 시작일 — yyyyMM01 */
    private static String periodStart(int year, int fromMm) {
        return String.format("%04d%02d01", year, Math.min(Math.max(fromMm, 1), 12));
    }

    /** 기간 종료일(미포함) — 종료월 다음 달 1일. 12월이면 다음 해 1월 1일. */
    private static String periodEnd(int year, int toMm) {
        int mm = Math.min(Math.max(toMm, 1), 12);
        return mm == 12 ? String.format("%04d0101", year + 1) : String.format("%04d%02d01", year, mm + 1);
    }

    /**
     * 기간별 거래처 매출 총액 + 마지막 거래일.
     * '관리 필요 거래처' 판정에서 올해·작년을 각각 한 번씩 불러 비교한다.
     * 연중에는 올해가 아직 덜 찼으므로 작년도 반드시 같은 월 구간으로 잘라 불러야 한다
     * (안 그러면 9월에 9개월 vs 12개월을 비교해 멀쩡한 거래처가 전부 '급감'으로 찍힌다).
     *
     * fromMm/toMm — 1~12. plantCd — 사업부문(1000 타라티피에스 / 2000 그래픽스 / 3000 PM). 비우면 전체.
     */
    public List<Object[]> getPartnerYearTotals(int year, int fromMm, int toMm, String plantCd) {
        String startDt = periodStart(year, fromMm);
        String endDt = periodEnd(year, toMm);
        boolean byPlant = plantCd != null && !plantCd.isBlank();
        String sql = """
                SELECT x.PARTNER_CD,
                       NVL((SELECT p.PARTNER_NM FROM CI_PARTNER_MST p
                             WHERE p.PARTNER_CD = x.PARTNER_CD AND ROWNUM = 1), x.PARTNER_CD) AS PARTNER_NM,
                       x.DEPT_CD,
                       NVL((SELECT d.DEPT_NM FROM VW_MA_DEPT_MST d
                             WHERE d.COMPANY_CD = '1000' AND d.DEPT_CD = x.DEPT_CD AND ROWNUM = 1), x.DEPT_CD) AS DEPT_NM,
                       x.TOTAL_AMT,
                       x.LAST_DT
                  FROM (
                        SELECT b.SALEPRTN_CD AS PARTNER_CD,
                               MAX(dt.SALESORGN_CD) KEEP (DENSE_RANK LAST ORDER BY b.BILL_DT) AS DEPT_CD,
                               SUM(NVL(dt.TRAN_AMT, 0)) AS TOTAL_AMT,
                               MAX(b.BILL_DT) AS LAST_DT
                          FROM SD_BILL_MST b
                          JOIN SD_BILL_DTL dt
                            ON dt.COMPANY_CD = b.COMPANY_CD
                           AND dt.BILLDOC_NO = b.BILLDOC_NO
                         WHERE b.COMPANY_CD = '1000'
                           AND b.BILL_DT >= ? AND b.BILL_DT < ?
                """
                + (byPlant ? "           AND dt.PLANT_CD = ?\n" : "")
                + """
                         GROUP BY b.SALEPRTN_CD
                       ) x
                """;
        List<Object> params = new ArrayList<>(List.of(startDt, endDt));
        if (byPlant) params.add(plantCd.trim());
        return jdbcTemplate.query(sql,
                (rs, rowNum) -> new Object[]{
                        rs.getString("PARTNER_CD"), rs.getString("PARTNER_NM"),
                        rs.getString("DEPT_CD"), rs.getString("DEPT_NM"),
                        rs.getLong("TOTAL_AMT"), rs.getString("LAST_DT")
                },
                params.toArray());
    }

    /**
     * 거래처 × 비용센터(CC_CD)별 매출 — 실제로 그 거래처에 매출을 올린 부서를 알아내기 위함.
     *
     * 전표의 SALESORGN_CD 는 전부 '1000(임원)' 한 값이라 팀 구분에 못 쓴다.
     * 반면 CC_CD 는 수주1팀 1201, 수주2팀 1202, 수주3팀 1203, 대교영업팀 1501 …처럼
     * users.cc_cd 와 같은 체계라 부서까지 연결된다.
     * 한 거래처를 여러 부서가 나눠 담당할 수 있으므로 거래처당 여러 행이 나온다.
     */
    public List<Object[]> getPartnerCcTotals(int year, int fromMm, int toMm, String plantCd) {
        String startDt = periodStart(year, fromMm);
        String endDt = periodEnd(year, toMm);
        boolean byPlant = plantCd != null && !plantCd.isBlank();
        String sql = """
                SELECT b.SALEPRTN_CD AS PARTNER_CD,
                       dt.CC_CD,
                       SUM(NVL(dt.TRAN_AMT, 0)) AS AMT
                  FROM SD_BILL_MST b
                  JOIN SD_BILL_DTL dt
                    ON dt.COMPANY_CD = b.COMPANY_CD
                   AND dt.BILLDOC_NO = b.BILLDOC_NO
                 WHERE b.COMPANY_CD = '1000'
                   AND b.BILL_DT >= ? AND b.BILL_DT < ?
                   AND dt.CC_CD IS NOT NULL
                """
                + (byPlant ? "   AND dt.PLANT_CD = ?\n" : "")
                + "                 GROUP BY b.SALEPRTN_CD, dt.CC_CD\n";
        List<Object> params = new ArrayList<>(List.of(startDt, endDt));
        if (byPlant) params.add(plantCd.trim());
        return jdbcTemplate.query(sql,
                (rs, rowNum) -> new Object[]{
                        rs.getString("PARTNER_CD"), rs.getString("CC_CD"), rs.getLong("AMT")
                },
                params.toArray());
    }

    /**
     * 거래처별 '진짜' 마지막 거래일 — 조회 기간과 무관하게 해당 연도 말까지의 최종 전표일.
     *
     * 금액은 기간으로 잘라야 비교가 되지만 마지막 거래일은 그러면 안 된다.
     * 9월만 조회했을 때 기간 안의 MAX(BILL_DT) 를 쓰면 "마지막 거래 9/30" 처럼
     * 실제로 언제 끊겼는지가 아니라 조회창의 끝날이 찍힌다.
     */
    public List<Object[]> getPartnerLastBillDt(int untilYear, String plantCd) {
        String endDt = String.format("%04d0101", untilYear + 1);
        boolean byPlant = plantCd != null && !plantCd.isBlank();
        String sql = """
                SELECT b.SALEPRTN_CD AS PARTNER_CD,
                       MAX(b.BILL_DT) AS LAST_DT
                  FROM SD_BILL_MST b
                  JOIN SD_BILL_DTL dt
                    ON dt.COMPANY_CD = b.COMPANY_CD
                   AND dt.BILLDOC_NO = b.BILLDOC_NO
                 WHERE b.COMPANY_CD = '1000'
                   AND b.BILL_DT < ?
                """
                + (byPlant ? "   AND dt.PLANT_CD = ?\n" : "")
                + "                 GROUP BY b.SALEPRTN_CD\n";
        List<Object> params = new ArrayList<>(List.of(endDt));
        if (byPlant) params.add(plantCd.trim());
        return jdbcTemplate.query(sql,
                (rs, rowNum) -> new Object[]{ rs.getString("PARTNER_CD"), rs.getString("LAST_DT") },
                params.toArray());
    }

    private String mapWrkFg(String wrkFg) {
        if (wrkFg == null) return "PENDING";
        return switch (wrkFg) {
            case "100" -> "PENDING";
            case "200" -> "CONFIRMED";
            case "300" -> "SHIPPED";
            case "400" -> "COMPLETED";
            case "900" -> "CANCELLED";
            default -> "PENDING";
        };
    }
}
