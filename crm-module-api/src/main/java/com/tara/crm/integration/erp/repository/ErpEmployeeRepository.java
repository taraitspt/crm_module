package com.tara.crm.integration.erp.repository;

import com.tara.crm.integration.erp.dto.ErpEmployeeDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.util.List;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Repository
@RequiredArgsConstructor
public class ErpEmployeeRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final RowMapper<ErpEmployeeDto> ROW_MAPPER = (rs, rowNum) ->
            ErpEmployeeDto.builder()
                    .empNo(rs.getString("EMP_NO"))
                    .korNm(rs.getString("KOR_NM"))
                    .deptCd(rs.getString("DEPT_CD"))
                    .deptNm(rs.getString("DEPT_NM"))
                    .odtyCd(rs.getString("ODTY_CD"))
                    .build();

    /**
     * 시트 #65 — 비용센터(MA_DEPT_MST.CC_CD)·입사일(HR_EMP_MST.JNCO_DT) 포함 row mapper.
     * Oracle JNCO_DT 컬럼 타입: NUMBER(8) yyyyMMdd 형식 (한국 ERP 통상 패턴).
     * email/phone 은 HR_EMP_MST 에 없으므로 매핑 제외 (필요 시 별도 HR_EMP_DTL 등 조인 추가).
     */
    /** 시트 #1 (2026-05-04) — HR_EMPINFO_DTL.CC_CD + CI_USER_MST.EMAIL_NM/HP_NO 포함 row mapper.
     *  EMP_NO/KOR_NM/DEPT_CD/CC_CD/JOIN_DT/EMAIL_NM/HP_NO 컬럼만 가정. DEPT_NM 은 별도 조회. */
    private static final RowMapper<ErpEmployeeDto> SHEET_ROW_MAPPER = (rs, rowNum) -> {
        long jdNum = rs.getLong("JOIN_DT");
        java.time.LocalDate joinDt = null;
        if (!rs.wasNull() && jdNum >= 19000101L && jdNum <= 99991231L) {
            try { joinDt = java.time.LocalDate.parse(String.valueOf(jdNum), java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd")); }
            catch (java.time.format.DateTimeParseException ignore) { /* 잘못된 값은 null */ }
        }
        return ErpEmployeeDto.builder()
                .empNo(rs.getString("EMP_NO"))
                .korNm(rs.getString("KOR_NM"))
                .deptCd(rs.getString("DEPT_CD"))
                .ccCd(rs.getString("CC_CD"))
                .joinDt(joinDt)
                .email(rs.getString("EMAIL_NM"))
                .phone(rs.getString("HP_NO"))
                .userId(rs.getString("USER_ID"))
                .build();
    };

    private static final RowMapper<ErpEmployeeDto> WITH_CC_ROW_MAPPER = (rs, rowNum) -> {
        long jdNum = rs.getLong("JOIN_DT");
        java.time.LocalDate joinDt = null;
        if (!rs.wasNull() && jdNum >= 19000101L && jdNum <= 99991231L) {
            try { joinDt = java.time.LocalDate.parse(String.valueOf(jdNum), java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd")); }
            catch (java.time.format.DateTimeParseException ignore) { /* 잘못된 값은 null */ }
        }
        return ErpEmployeeDto.builder()
                .empNo(rs.getString("EMP_NO"))
                .korNm(rs.getString("KOR_NM"))
                .deptCd(rs.getString("DEPT_CD"))
                .deptNm(rs.getString("DEPT_NM"))
                .ccCd(rs.getString("CC_CD"))
                .joinDt(joinDt)
                .build();
    };

    public List<ErpEmployeeDto> findAllActive() {
        return jdbcTemplate.query(
                """
                SELECT E.EMP_NO, E.KOR_NM, E.DEPT_CD, D.DEPT_NM, E.ODTY_CD
                  FROM HR_EMP_MST E
                  LEFT JOIN MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD
                 WHERE E.COMPANY_CD = '1000'
                   AND E.HLOF_FG_CD = '1'
                """,
                ROW_MAPPER
        );
    }

    /** 영업 직원만 조회 */
    public List<ErpEmployeeDto> findAllActiveSalesOnly() {
        return jdbcTemplate.query(
                """
                SELECT E.EMP_NO, E.KOR_NM, E.DEPT_CD, D.DEPT_NM, E.ODTY_CD
                  FROM HR_EMP_MST E
                  LEFT JOIN MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD
                 WHERE E.COMPANY_CD = '1000'
                   AND E.RETR_DT IS NULL
                   AND E.EMP_TP = '200'
                   AND E.BIZAREA_CD = '9000'
                """,
                ROW_MAPPER
        );
    }

    /** 사업 구분별 영업 직원 조회 (PLANT_CD 대신 DEPT_CD 범위로 구분) */
    public List<ErpEmployeeDto> findAllActiveByPlant(String plantCd) {
        // PLANT_CD가 Oracle에서 모두 NULL이므로 DEPT_CD 범위로 사업부문 구분
        // 1000=타라티피에스(4xxx영업), 2000=그래픽스(9xxx BS팀), 3000=PM
        if ("2000".equals(plantCd)) {
            return jdbcTemplate.query(
                    """
                    SELECT E.EMP_NO, E.KOR_NM, E.DEPT_CD, D.DEPT_NM, E.ODTY_CD
                      FROM HR_EMP_MST E
                      LEFT JOIN MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD
                     WHERE E.COMPANY_CD = '1000'
                       AND E.HLOF_FG_CD = '1'
                       AND TO_NUMBER(E.DEPT_CD) BETWEEN 9000 AND 9999
                       AND TO_NUMBER(E.DEPT_CD) IN (9938, 9940, 9946, 9925, 9922, 9934, 9923, 9921, 9924, 9942, 9920, 9951)
		       AND EMP_NO LIKE '%100%'
                    """,
                    ROW_MAPPER
            );
        } else if ("1000".equals(plantCd)) {
            return jdbcTemplate.query(
                    """
                    SELECT E.EMP_NO, E.KOR_NM, E.DEPT_CD, D.DEPT_NM, E.ODTY_CD
                      FROM HR_EMP_MST E
                      LEFT JOIN MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD
                     WHERE E.COMPANY_CD = '1000'
                       AND E.HLOF_FG_CD = '1'
                       AND TO_NUMBER(E.DEPT_CD) BETWEEN 4000 AND 4999
                    """,
                    ROW_MAPPER
            );
        } else {
            // 3000(PM) 등 기타: 전체 영업 직원 반환
            return findAllActiveSalesOnly();
        }
    }

    /** 키워드로 사원 검색 (이름 또는 사번) */
    public List<ErpEmployeeDto> searchByKeyword(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return jdbcTemplate.query(
                    """
                    SELECT E.EMP_NO, E.KOR_NM, E.DEPT_CD, D.DEPT_NM, E.ODTY_CD
                      FROM HR_EMP_MST E
                      LEFT JOIN MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD
                     WHERE E.COMPANY_CD = '1000' AND E.HLOF_FG_CD = '1'
                       AND ROWNUM <= 20
                     ORDER BY E.KOR_NM
                    """,
                    ROW_MAPPER
            );
        }
        return jdbcTemplate.query(
                """
                SELECT E.EMP_NO, E.KOR_NM, E.DEPT_CD, D.DEPT_NM, E.ODTY_CD
                  FROM HR_EMP_MST E
                  LEFT JOIN MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD
                 WHERE E.COMPANY_CD = '1000' AND E.HLOF_FG_CD = '1'
                   AND (E.KOR_NM LIKE '%' || ? || '%' OR E.EMP_NO LIKE '%' || ? || '%')
                   AND ROWNUM <= 20
                 ORDER BY E.KOR_NM
                """,
                ROW_MAPPER, keyword, keyword
        );
    }

    /** HR_EMP_MST의 PLANT_CD/영업직원 관련 컬럼 분포 확인 (진단용) */
    public java.util.Map<String, Object> diagnosePlantCd() {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        List<java.util.Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT PLANT_CD, COUNT(*) CNT FROM HR_EMP_MST WHERE COMPANY_CD = '1000' AND HLOF_FG_CD = '1' GROUP BY PLANT_CD ORDER BY PLANT_CD"
        );
        result.put("plantCdGroups", rows);
        // SLST_CD 분포
        List<java.util.Map<String, Object>> slstRows = jdbcTemplate.queryForList(
                "SELECT SLST_CD, COUNT(*) CNT FROM HR_EMP_MST WHERE COMPANY_CD = '1000' AND HLOF_FG_CD = '1' GROUP BY SLST_CD ORDER BY CNT DESC"
        );
        result.put("slstCdGroups", slstRows);
        // JKND_CD 분포
        List<java.util.Map<String, Object>> jkndRows = jdbcTemplate.queryForList(
                "SELECT JKND_CD, COUNT(*) CNT FROM HR_EMP_MST WHERE COMPANY_CD = '1000' AND HLOF_FG_CD = '1' GROUP BY JKND_CD ORDER BY CNT DESC"
        );
        result.put("jkndCdGroups", jkndRows);
        // EMP_TP 분포
        List<java.util.Map<String, Object>> empTpRows = jdbcTemplate.queryForList(
                "SELECT EMP_TP, COUNT(*) CNT FROM HR_EMP_MST WHERE COMPANY_CD = '1000' AND HLOF_FG_CD = '1' GROUP BY EMP_TP ORDER BY CNT DESC"
        );
        result.put("empTpGroups", empTpRows);
        // 샘플 (SLST_CD 있는 직원)
        List<java.util.Map<String, Object>> slstSample = jdbcTemplate.queryForList(
                "SELECT EMP_NO, KOR_NM, DEPT_CD, SLST_CD, JKND_CD, EMP_TP FROM HR_EMP_MST WHERE COMPANY_CD = '1000' AND HLOF_FG_CD = '1' AND SLST_CD IS NOT NULL AND ROWNUM <= 10"
        );
        result.put("slstSample", slstSample);
        // BIZAREA_CD 분포 (부서 기준) - MIN() 집계로 VIEW 표현식 GROUP BY 오류 회피
        List<java.util.Map<String, Object>> bizAreaRows = jdbcTemplate.queryForList(
                "SELECT D.BIZAREA_CD, MIN(D.BIZAREA_NM) BIZAREA_NM, COUNT(*) CNT FROM HR_EMP_MST E JOIN VW_MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD WHERE E.COMPANY_CD = '1000' AND E.HLOF_FG_CD = '1' GROUP BY D.BIZAREA_CD ORDER BY CNT DESC"
        );
        result.put("bizAreaGroups", bizAreaRows);
        // 부서코드-BIZAREA 샘플
        List<java.util.Map<String, Object>> bizAreaSample = jdbcTemplate.queryForList(
                "SELECT E.DEPT_CD, MIN(D.DEPT_NM) DEPT_NM, MIN(D.BIZAREA_CD) BIZAREA_CD, MIN(D.BIZAREA_NM) BIZAREA_NM, COUNT(*) CNT FROM HR_EMP_MST E JOIN VW_MA_DEPT_MST D ON E.COMPANY_CD = D.COMPANY_CD AND E.DEPT_CD = D.DEPT_CD WHERE E.COMPANY_CD = '1000' AND E.HLOF_FG_CD = '1' GROUP BY E.DEPT_CD ORDER BY 1"
        );
        result.put("bizAreaSample", bizAreaSample);
        return result;
    }

    /**
     * 시트 #1 (2026-05-04 정정) — 비용센터 출처를 HR_EMPINFO_DTL.CC_CD (사원 단위) 로 변경.
     * 기존 MA_DEPT_MST.CC_CD (부서 단위) 는 부서가 같으면 같은 cc_cd 를 반환해 영업담당자 개인의
     * 실제 비용센터를 반영 못 함.
     *
     * 추가 정정:
     *   - 이메일/전화번호 출처도 HR_EMP_MST 가 아닌 CI_USER_MST (CRM 사용자 마스터)
     *   - 한 사원이 CI_USER_MST 에 N개 행을 가질 수 있어서 ROW_NUMBER PARTITION 으로 dedup.
     *     이메일이 @tara 도메인이면 우선(RN=1), 그 외 도메인은 RN=2 부터.
     *   - 퇴사자 제외(RETR_DT IS NULL), 이메일 있는 행만(WHERE CUM.EMAIL_NM IS NOT NULL)
     */
    public List<ErpEmployeeDto> findAllActiveWithCcCd() {
        return jdbcTemplate.query(
                """
                SELECT EMP_NO, KOR_NM, DEPT_CD, CC_CD, JNCO_DT AS JOIN_DT, EMAIL_NM, HP_NO, USER_ID
                  FROM (
                    SELECT HEM.EMP_NO,
                           HEM.KOR_NM,
                           HEM.DEPT_CD,
                           HED.CC_CD,
                           HEM.JNCO_DT,
                           CUM.EMAIL_NM,
                           CUM.HP_NO,
                           CUM.USER_ID,
                           ROW_NUMBER() OVER (
                             PARTITION BY HEM.EMP_NO
                             ORDER BY CASE WHEN CUM.EMAIL_NM LIKE '%@tara%' THEN 1 ELSE 2 END,
                                      CUM.EMAIL_NM
                           ) AS RN
                      FROM HR_EMP_MST HEM
                      LEFT OUTER JOIN HR_EMPINFO_DTL HED
                             ON HED.COMPANY_CD = HEM.COMPANY_CD
                            AND HED.EMP_NO     = HEM.EMP_NO
                      LEFT JOIN CI_USER_MST CUM
                             ON HEM.EMP_NO = CUM.GEMP_NO
                     WHERE HEM.RETR_DT IS NULL
                       AND CUM.EMAIL_NM IS NOT NULL
                       AND HEM.COMPANY_CD = '1000'
                  )
                 WHERE RN = 1
                """,
                SHEET_ROW_MAPPER
        );
    }

    /** 특정 일자 기준 가입자만 조회 (매일 01:00 incremental 배치). JNCO_DT 는 NUMBER yyyyMMdd. */
    public List<ErpEmployeeDto> findJoinedOn(java.time.LocalDate date) {
        long ymd = Long.parseLong(date.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd")));
        return jdbcTemplate.query(
                """
                SELECT EMP_NO, KOR_NM, DEPT_CD, CC_CD, JNCO_DT AS JOIN_DT, EMAIL_NM, HP_NO, USER_ID
                  FROM (
                    SELECT HEM.EMP_NO,
                           HEM.KOR_NM,
                           HEM.DEPT_CD,
                           HED.CC_CD,
                           HEM.JNCO_DT,
                           CUM.EMAIL_NM,
                           CUM.HP_NO,
                           CUM.USER_ID,
                           ROW_NUMBER() OVER (
                             PARTITION BY HEM.EMP_NO
                             ORDER BY CASE WHEN CUM.EMAIL_NM LIKE '%@tara%' THEN 1 ELSE 2 END,
                                      CUM.EMAIL_NM
                           ) AS RN
                      FROM HR_EMP_MST HEM
                      LEFT OUTER JOIN HR_EMPINFO_DTL HED
                             ON HED.COMPANY_CD = HEM.COMPANY_CD
                            AND HED.EMP_NO     = HEM.EMP_NO
                      LEFT JOIN CI_USER_MST CUM
                             ON HEM.EMP_NO = CUM.GEMP_NO
                     WHERE HEM.RETR_DT IS NULL
                       AND CUM.EMAIL_NM IS NOT NULL
                       AND HEM.COMPANY_CD = '1000'
                       AND HEM.JNCO_DT = ?
                  )
                 WHERE RN = 1
                """,
                SHEET_ROW_MAPPER,
                ymd
        );
    }

    /** 사번으로 이름 조회. 마스터성(거의 불변)이라 캐시 — 마스터 sync 때 evict. 실적 수치는 캐시하지 않음. */
    @Cacheable(cacheNames = "erpEmpNames", key = "#empNo", condition = "#empNo != null and #empNo != ''")
    public String findNameByEmpNo(String empNo) {
        if (empNo == null || empNo.isBlank()) return null;
        List<String> names = jdbcTemplate.query(
                "SELECT KOR_NM FROM HR_EMP_MST WHERE COMPANY_CD = '1000' AND EMP_NO = ?",
                (rs, rowNum) -> rs.getString("KOR_NM"),
                empNo
        );
        return names.isEmpty() ? null : names.get(0);
    }
}
