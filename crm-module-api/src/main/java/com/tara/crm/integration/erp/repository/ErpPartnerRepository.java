package com.tara.crm.integration.erp.repository;

import com.tara.crm.integration.erp.dto.ErpPartnerFunctionDto;
import com.tara.crm.integration.erp.dto.ErpPartnerDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.util.List;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Repository
@Slf4j
@RequiredArgsConstructor
public class ErpPartnerRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final RowMapper<ErpPartnerDto> ROW_MAPPER = (rs, rowNum) -> {
        java.sql.Timestamp insertTs = rs.getTimestamp("INSERT_DTS");
        java.sql.Timestamp updateTs = rs.getTimestamp("UPDATE_DTS");
        return ErpPartnerDto.builder()
                    .partnerCd(rs.getString("PARTNER_CD"))
                    .partnerNm(rs.getString("PARTNER_NM"))
                    .bizrNo(rs.getString("BIZR_NO"))
                    .ceoNm(rs.getString("CEO_NM"))
                    .biztpNm(rs.getString("BIZTP_NM"))
                    .bizcNm(rs.getString("BIZC_NM"))
                    .baseAddr(rs.getString("BASE_ADDR"))
                    .dtlAddr2(rs.getString("DTL_ADDR2"))
                    .telNo(rs.getString("TEL_NO"))
                    .faxNo(rs.getString("FAX_NO"))
                    .deptCd(rs.getString("DEPT_CD"))
                    .deptNm(rs.getString("DEPT_NM"))
                    .insertDts(insertTs != null ? insertTs.toLocalDateTime() : null)
                    .updateDts(updateTs != null ? updateTs.toLocalDateTime() : null)
                    .build();
    };

    // PR-31 시트 정정 (Critical-4) — SUBO_NO/POST_NO/INSERT_DTS/UPDATE_DTS 컬럼 추가.
    // SQL 에 해당 컬럼이 없을 때를 대비해 try/catch 안전 (다른 SQL 재사용 시 깨지지 않도록).
    private static String safeStr(java.sql.ResultSet rs, String col) {
        try { return rs.getString(col); } catch (java.sql.SQLException e) { return null; }
    }
    private static java.time.LocalDateTime safeTs(java.sql.ResultSet rs, String col) {
        try { java.sql.Timestamp t = rs.getTimestamp(col); return t != null ? t.toLocalDateTime() : null; }
        catch (java.sql.SQLException e) { return null; }
    }

    private static final RowMapper<ErpPartnerDto> SALES_ROW_MAPPER = (rs, rowNum) ->
            ErpPartnerDto.builder()
                    .partnerCd(rs.getString("PARTNER_CD"))
                    .partnerNm(rs.getString("PARTNER_NM"))
                    .bizrNo(rs.getString("BIZR_NO"))
                    .ceoNm(safeStr(rs, "CEO_NM"))
                    .biztpNm(rs.getString("BIZTP_NM"))
                    .bizcNm(rs.getString("BIZC_NM"))
                    .baseAddr(rs.getString("BASE_ADDR"))
                    .dtlAddr2(rs.getString("DTL_ADDR2"))
                    .telNo(rs.getString("TEL_NO"))
                    .faxNo(rs.getString("FAX_NO"))
                    .asgnrNm(safeStr(rs, "ASGNR_NM"))
                    .asgnrDeptNm(safeStr(rs, "ASGNR_DEPT_NM"))
                    .asgnrOdtyNm(safeStr(rs, "ASGNR_ODTY_NM"))
                    .asgnrHpNo(safeStr(rs, "ASGNR_HP_NO"))
                    .asgnrTelNo(safeStr(rs, "ASGNR_TEL_NO"))
                    .asgnrEmail(safeStr(rs, "ASGNR_EMAIL_NM"))
                    .suboNo(safeStr(rs, "SUBO_NO"))
                    .postNo(safeStr(rs, "POST_NO"))
                    .insertDts(safeTs(rs, "INSERT_DTS"))
                    .updateDts(safeTs(rs, "UPDATE_DTS"))
                    .build();

    private static final RowMapper<ErpPartnerFunctionDto> PARTNER_FUNCTION_ROW_MAPPER = (rs, rowNum) ->
            ErpPartnerFunctionDto.builder()
                    .companyCd(rs.getString("COMPANY_CD"))
                    .partnerCd(rs.getString("PARTNER_CD"))
                    .partnerNm(safeStr(rs, "PARTNER_NM"))
                    .salesorgnCd(rs.getString("SALESORGN_CD"))
                    .dischCd(rs.getString("DISCH_CD"))
                    .prductgrpCd(rs.getString("PRDUCTGRP_CD"))
                    .prtnrFnCd(rs.getString("PRTNR_FN_CD"))
                    .prtnrCd(rs.getString("PRTNR_CD"))
                    .partnerBpName(safeStr(rs, "NM_PARTNER_BP"))
                    .partnerBpDeptCd(safeStr(rs, "DEPT_CD"))
                    .partnerBpDeptName(safeStr(rs, "DEPT_NM"))
                    .defaultYn(safeStr(rs, "DFLT_YN") != null ? safeStr(rs, "DFLT_YN") : "N")
                    .build();

    // MA_PARTNERSA_INFO (DISCH_CD='2000') primary + CI_PARTNER_MST left join + CC_NM for dept
    private static final String BASE_FROM = """
              FROM (
                SELECT PARTNER_CD, CC_CD, PLANT_CD, COMPANY_CD
                  FROM (SELECT PARTNER_CD, CC_CD, PLANT_CD, COMPANY_CD,
                               ROW_NUMBER() OVER (PARTITION BY PARTNER_CD ORDER BY ROWID) rn
                          FROM MA_PARTNERSA_INFO
                         WHERE DISCH_CD = '2000' AND COMPANY_CD = '1000')
                 WHERE rn = 1
              ) sa
              LEFT JOIN CI_PARTNER_MST p ON p.PARTNER_CD = sa.PARTNER_CD
              LEFT JOIN (
                SELECT COMPANY_CD, CC_CD, CC_NM
                  FROM (SELECT COMPANY_CD, CC_CD, CC_NM,
                               ROW_NUMBER() OVER (PARTITION BY COMPANY_CD, CC_CD ORDER BY START_DT DESC) rn
                          FROM MA_CC_MST)
                 WHERE rn = 1 AND COMPANY_CD = '1000'
              ) mcm ON mcm.COMPANY_CD = sa.COMPANY_CD AND mcm.CC_CD = sa.CC_CD
            """;

    private static final String BASE_SELECT =
            "SELECT p.PARTNER_CD, p.PARTNER_NM, p.BIZR_NO, p.CEO_NM, p.BIZTP_NM, p.BIZC_NM, " +
            "p.BASE_ADDR, p.DTL_ADDR2, p.TEL_NO, p.FAX_NO, mcm.CC_CD AS DEPT_CD, mcm.CC_NM AS DEPT_NM, " +
            "p.INSERT_DTS, p.UPDATE_DTS ";

    public List<ErpPartnerDto> findAllActive() {
        return jdbcTemplate.query(
                BASE_SELECT + BASE_FROM,
                ROW_MAPPER
        );
    }

    /** 시트 5/13 — 동기화/세금계산서 자동매핑 용도 풀조회.
     *  CI_PARTNER_MST + MA_PARTNER_MST(SUBO_NO) + MA_PARTNER_PTR(담당자) 까지 LEFT JOIN. */
    public List<ErpPartnerDto> findAllActiveFull() {
        String sql = """
                SELECT A.PARTNER_CD,
                       B.PARTNER_NM, B.BIZR_NO, B.CEO_NM,
                       B.BIZTP_NM, B.BIZC_NM,
                       B.POST_NO, B.BASE_ADDR, B.DTL_ADDR2,
                       B.TEL_NO, B.FAX_NO,
                       B.INSERT_DTS, B.UPDATE_DTS,
                       C.SUBO_NO,
                       D.ASGNR_NM, D.ASGNR_DEPT_NM, D.ASGNR_ODTY_NM,
                       D.ASGNR_HP_NO, D.ASGNR_TEL_NO, D.ASGNR_EMAIL_NM
                  -- 더존 영업거래처 정식 조건: COMPANY_CD='1000' + SALESORGN_CD='1000' + DISCH_CD='2000' + PRDUCTGRP_CD='00'
                  -- + 파트너 활성(MA_PARTNER_MST/CI_PARTNER_MST USE_YN='Y'). 사업자관리 목록 = 이 집합과 일치.
                  FROM (SELECT PARTNER_CD
                          FROM (SELECT PARTNER_CD,
                                       ROW_NUMBER() OVER (PARTITION BY PARTNER_CD ORDER BY ROWID) rn
                                  FROM MA_PARTNERSA_INFO
                                 WHERE COMPANY_CD = '1000' AND SALESORGN_CD = '1000'
                                   AND DISCH_CD = '2000' AND PRDUCTGRP_CD = '00')
                         WHERE rn = 1) A
                  INNER JOIN CI_PARTNER_MST B ON A.PARTNER_CD = B.PARTNER_CD AND B.USE_YN = 'Y'
                  INNER JOIN MA_PARTNER_MST C ON A.PARTNER_CD = C.PARTNER_CD AND C.COMPANY_CD = '1000' AND C.USE_YN = 'Y'
                  LEFT JOIN MA_PARTNER_PTR D ON D.COMPANY_CD = '1000'
                                            AND D.PARTNER_CD = A.PARTNER_CD
                                            AND D.USE_YN = 'Y'
                """;
        return jdbcTemplate.query(sql, SALES_ROW_MAPPER);
    }

    /** partnerCd로 단건 조회. MA_PARTNERSA_INFO(매출채널) 조인 우선, 없으면 CI_PARTNER_MST 직접 폴백 (매입 외주사 대응).
     *  TRIM 사용: PARTNER_CD 가 Oracle CHAR/VARCHAR2 타입일 때 앞뒤 공백 패딩으로 인한 = 불일치를 방지.
     *  (LIKE '%cd%' 는 패딩 무관 성공하지만 = 는 실패하는 케이스 대응) */
    public ErpPartnerDto findByPartnerCd(String partnerCd) {
        if (partnerCd == null) return null;
        String cd = partnerCd.trim();
        List<ErpPartnerDto> results = jdbcTemplate.query(
                BASE_SELECT + BASE_FROM + " WHERE TRIM(sa.PARTNER_CD) = ?",
                ROW_MAPPER, cd
        );
        if (!results.isEmpty()) return results.get(0);
        results = jdbcTemplate.query(
                "SELECT PARTNER_CD, PARTNER_NM, BIZR_NO, CEO_NM, BIZTP_NM, BIZC_NM," +
                " BASE_ADDR, DTL_ADDR2, TEL_NO, FAX_NO, NULL AS DEPT_CD, NULL AS DEPT_NM," +
                " INSERT_DTS, UPDATE_DTS FROM CI_PARTNER_MST WHERE TRIM(PARTNER_CD) = ?",
                ROW_MAPPER, cd);
        if (!results.isEmpty()) {
            return results.get(0);
        }
        // TRIM 으로도 못 찾으면 LIKE 폴백 (마지막 수단)
        results = jdbcTemplate.query(
                "SELECT PARTNER_CD, PARTNER_NM, BIZR_NO, CEO_NM, BIZTP_NM, BIZC_NM," +
                " BASE_ADDR, DTL_ADDR2, TEL_NO, FAX_NO, NULL AS DEPT_CD, NULL AS DEPT_NM," +
                " INSERT_DTS, UPDATE_DTS FROM CI_PARTNER_MST" +
                " WHERE PARTNER_CD LIKE '%' || ? || '%' AND ROWNUM = 1",
                ROW_MAPPER, cd);
        return results.isEmpty() ? null : results.get(0);
    }

    /** 거래처코드 → 사업자번호 직접 조회(CI_PARTNER_MST). findByPartnerCd 가 MA_PARTNERSA_INFO 등에서
     *  BIZR_NO 없는 행을 먼저 잡는 케이스 폴백용. TRIM + BIZR_NO 존재 조건. */
    public String findBizNoByPartnerCd(String partnerCd) {
        if (partnerCd == null || partnerCd.isBlank()) return null;
        String cd = partnerCd.trim();
        // 1) CI_PARTNER_MST 직접 조회
        // ★ROWNUM=1 을 WHERE 에 두지 않는다 — Oracle 이 다른 조건보다 ROWNUM 을 먼저 적용해
        //   조건에 맞는 행이 있어도 0건이 나오는 함정. 결과 리스트에서 첫 행만 취한다.
        List<String> r = jdbcTemplate.query(
                "SELECT BIZR_NO FROM CI_PARTNER_MST WHERE TRIM(PARTNER_CD) = TRIM(?) " +
                "AND BIZR_NO IS NOT NULL",
                (rs, n) -> rs.getString("BIZR_NO"), cd);
        if (!r.isEmpty() && r.get(0) != null && !r.get(0).isBlank()) return r.get(0).trim();
        // 2) 직접조회(1)가 놓치면 '사업자관리'와 동일 경로(MA_PARTNERSA_INFO DISCH_CD='2000' + CI_PARTNER_MST 조인)로 보완.
        //    사업자관리 화면에 뜨는 거래처는 여기서 확실히 잡힌다(예: 38043). 정확 코드만 매칭(LIKE 금지 → 다른 거래처 오조회 방지).
        try {
            List<String> r2 = jdbcTemplate.query(
                    BASE_SELECT + BASE_FROM + " WHERE TRIM(sa.PARTNER_CD) = ? " +
                    "AND p.BIZR_NO IS NOT NULL",
                    (rs, n) -> rs.getString("BIZR_NO"), cd);
            if (!r2.isEmpty() && r2.get(0) != null && !r2.get(0).isBlank()) return r2.get(0).trim();
        } catch (Exception ignore) { /* 조인 경로 실패는 무시 */ }
        return null;
    }

    /** 거래처코드 목록 → 사업자번호 맵. 정산목록 등 대량 폴백용. 단건 findBizNoByPartnerCd 와 동일 커버리지:
     *  ① CI_PARTNER_MST 직접 IN 조회 → ② 놓친 코드는 '사업자관리'와 동일 경로(MA_PARTNERSA_INFO DISCH_CD='2000' + CI_PARTNER_MST)로 보완.
     *  Oracle IN 1000 상한 대비 청크 분할. */
    public java.util.Map<String, String> findBizNosByPartnerCds(java.util.Collection<String> partnerCds) {
        java.util.Map<String, String> map = new java.util.HashMap<>();
        if (partnerCds == null || partnerCds.isEmpty()) return map;
        List<String> cds = partnerCds.stream()
                .filter(c -> c != null && !c.isBlank()).map(String::trim).distinct()
                .collect(java.util.stream.Collectors.toList());
        // 1) CI_PARTNER_MST 직접 조회
        queryBizNoChunked(cds, map,
                "SELECT TRIM(PARTNER_CD) AS PC, BIZR_NO FROM CI_PARTNER_MST " +
                "WHERE TRIM(PARTNER_CD) IN (%s) AND BIZR_NO IS NOT NULL");
        // 2) 직접조회에서 못 잡은 코드 보완 (예: 사업자관리 화면에만 뜨는 거래처)
        List<String> missing = cds.stream().filter(c -> !map.containsKey(c))
                .collect(java.util.stream.Collectors.toList());
        if (!missing.isEmpty()) {
            queryBizNoChunked(missing, map,
                    "SELECT TRIM(sa.PARTNER_CD) AS PC, p.BIZR_NO " + BASE_FROM +
                    " WHERE TRIM(sa.PARTNER_CD) IN (%s) AND p.BIZR_NO IS NOT NULL");
        }
        return map;
    }

    /** partnerCd 리스트를 1000개씩 청크로 나눠 (PC, BIZR_NO) 조회 → map 채움(putIfAbsent). sqlTemplate 의 %s 에 IN placeholders 삽입. */
    private void queryBizNoChunked(List<String> cds, java.util.Map<String, String> map, String sqlTemplate) {
        for (int i = 0; i < cds.size(); i += 1000) {
            List<String> chunk = cds.subList(i, Math.min(i + 1000, cds.size()));
            String placeholders = String.join(",", java.util.Collections.nCopies(chunk.size(), "?"));
            try {
                List<String[]> rows = jdbcTemplate.query(
                        String.format(sqlTemplate, placeholders),
                        (rs, n) -> new String[]{ rs.getString("PC"), rs.getString("BIZR_NO") },
                        chunk.toArray());
                for (String[] row : rows) {
                    if (row[0] != null && row[1] != null && !row[1].isBlank()) {
                        map.putIfAbsent(row[0].trim(), row[1].trim());
                    }
                }
            } catch (Exception e) {
                // fail-soft 유지하되 조용히 삼키지 않는다 — 코드 조회가 통째로 비면 호출부가 이름 폴백으로 빠져
                // 동명 거래처(신양봉투 3개 등)에 엉뚱한 사업자번호를 붙인다. 원인 추적용 로그.
                log.warn("[ErpPartner] 사업자번호 배치 조회 실패 ({}건): {}", chunk.size(), e.getMessage());
            }
        }
    }

    /** 사업자등록번호 → 거래처코드 해소(하이픈/공백 무시, 첫 매칭). 없으면 null.
     *  매출 빌링 전송 시 partnerCd 누락 건의 폴백 매핑용. */
    public String findPartnerCdByBizNo(String bizNo) {
        if (bizNo == null) return null;
        String digits = bizNo.replaceAll("[^0-9]", "");
        if (digits.isBlank()) return null;
        List<String> r = jdbcTemplate.query(
                "SELECT PARTNER_CD FROM CI_PARTNER_MST " +
                "WHERE REPLACE(REPLACE(BIZR_NO, '-', ''), ' ', '') = ?",
                (rs, n) -> rs.getString("PARTNER_CD"), digits);
        return r.isEmpty() ? null : r.get(0);
    }

    /** 거래처명(정확 일치, trim) → 거래처코드 해소(첫 매칭). 없으면 null.
     *  사업자번호로 못 찾았을 때의 2차 폴백. */
    public String findPartnerCdByName(String partnerNm) {
        if (partnerNm == null || partnerNm.isBlank()) return null;
        // PARTNER_NM 이 Oracle CHAR 컬럼이면 공백 패딩으로 정확일치가 실패 → 양쪽 TRIM 비교.
        List<String> r = jdbcTemplate.query(
                "SELECT PARTNER_CD FROM CI_PARTNER_MST WHERE TRIM(PARTNER_NM) = TRIM(?)",
                (rs, n) -> rs.getString("PARTNER_CD"), partnerNm.trim());
        return r.isEmpty() ? null : r.get(0);
    }

    /** 상호 정규화(공백·주식회사·(주)·㈜·(유)·유한회사 제거) 후 사업자번호 조회.
     *  정확 코드/정확이름 폴백이 모두 실패한 거래처의 3차 폴백.
     *  (예: 매출엔 "쿤데스튜디오"로 저장 ↔ ERP "주식회사 쿤데스튜디오"). SQL·Java 정규화 규칙 동일 유지 필수. */
    public String findBizNoByNormalizedName(String partnerNm) {
        if (partnerNm == null || partnerNm.isBlank()) return null;
        String norm = normalizeName(partnerNm.trim());
        if (norm.length() < 2) return null;   // 너무 짧으면 오탐 방지(스킵)
        List<String> r = jdbcTemplate.query(
                "SELECT BIZR_NO FROM CI_PARTNER_MST " +
                "WHERE TRIM(BIZR_NO) IS NOT NULL " +
                "AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(PARTNER_NM,' ',''),'주식회사',''),'(주)',''),'㈜',''),'(유)',''),'유한회사','') = ?",
                (rs, n) -> rs.getString("BIZR_NO"), norm);
        return r.isEmpty() ? null : (r.get(0) == null ? null : r.get(0).trim());
    }

    /** 상호 정규화 — 위 SQL 의 REPLACE 체인과 동일한 토큰/순서를 유지해야 매칭이 성립한다. */
    private static String normalizeName(String s) {
        if (s == null) return "";
        return s.replace(" ", "").replace("주식회사", "").replace("(주)", "")
                .replace("㈜", "").replace("(유)", "").replace("유한회사", "");
    }

    /** 시트 5/13 — 세금계산서발행 거래처 자동매핑 용도 단건 풀조회.
     *  CI_PARTNER_MST + MA_PARTNER_MST(SUBO_NO) + MA_PARTNER_PTR(담당자) 까지 LEFT JOIN. */
    public ErpPartnerDto findFullByPartnerCd(String partnerCd) {
        if (partnerCd == null || partnerCd.isBlank()) return null;
        String cd = partnerCd.trim();
        String sql = """
                SELECT A.PARTNER_CD,
                       B.PARTNER_NM, B.BIZR_NO, B.CEO_NM,
                       B.BIZTP_NM, B.BIZC_NM,
                       B.POST_NO, B.BASE_ADDR, B.DTL_ADDR2,
                       B.TEL_NO, B.FAX_NO,
                       B.INSERT_DTS, B.UPDATE_DTS,
                       C.SUBO_NO,
                       D.ASGNR_NM, D.ASGNR_DEPT_NM, D.ASGNR_ODTY_NM,
                       D.ASGNR_HP_NO, D.ASGNR_TEL_NO, D.ASGNR_EMAIL_NM
                  FROM MA_PARTNERSA_INFO A
                  LEFT JOIN CI_PARTNER_MST B ON A.PARTNER_CD = B.PARTNER_CD
                  LEFT JOIN MA_PARTNER_MST C ON A.PARTNER_CD = C.PARTNER_CD AND C.COMPANY_CD = '1000'
                  LEFT JOIN MA_PARTNER_PTR D ON D.COMPANY_CD = '1000'
                                            AND D.PARTNER_CD = A.PARTNER_CD
                                            AND D.USE_YN = 'Y'
                 WHERE A.DISCH_CD = '2000' AND TRIM(A.PARTNER_CD) = ?
                   AND ROWNUM <= 1
                """;
        List<ErpPartnerDto> results = jdbcTemplate.query(sql, SALES_ROW_MAPPER, cd);
        if (!results.isEmpty()) return results.get(0);

        String fallbackSql = """
                SELECT B.PARTNER_CD,
                       B.PARTNER_NM, B.BIZR_NO, B.CEO_NM,
                       B.BIZTP_NM, B.BIZC_NM,
                       B.POST_NO, B.BASE_ADDR, B.DTL_ADDR2,
                       B.TEL_NO, B.FAX_NO,
                       B.INSERT_DTS, B.UPDATE_DTS,
                       C.SUBO_NO,
                       D.ASGNR_NM, D.ASGNR_DEPT_NM, D.ASGNR_ODTY_NM,
                       D.ASGNR_HP_NO, D.ASGNR_TEL_NO, D.ASGNR_EMAIL_NM
                  FROM CI_PARTNER_MST B
                  LEFT JOIN MA_PARTNER_MST C ON B.PARTNER_CD = C.PARTNER_CD AND C.COMPANY_CD = '1000'
                  LEFT JOIN MA_PARTNER_PTR D ON D.COMPANY_CD = '1000'
                                            AND D.PARTNER_CD = B.PARTNER_CD
                                            AND D.USE_YN = 'Y'
                 WHERE TRIM(B.PARTNER_CD) = ?
                   AND ROWNUM <= 1
                """;
        results = jdbcTemplate.query(fallbackSql, SALES_ROW_MAPPER, cd);
        return results.isEmpty() ? null : results.get(0);
    }

    public List<ErpPartnerDto> findByKeyword(String keyword) {
        // 사용 중인 ERP 거래처 중 1000 회사에 등록된 거래처만 검색한다.
        // ★정렬 후 상한(2026-09-07 #378): 종전엔 ORDER BY 없이 ROWNUM<=20 이라 "서울특별시" 처럼 같은 단어가 들어간
        //   거래처가 20개를 넘으면 정작 정확일치 거래처가 잘려 "검색 안 됨" 으로 보였다.
        //   정확일치 → 앞글자일치 → 포함 순, 같은 등급이면 짧은 이름(본체) 우선. 상한 30.
        String kw = keyword == null ? "" : keyword.trim();
        return jdbcTemplate.query(
                "SELECT * FROM (" +
                "SELECT C.PARTNER_CD, C.PARTNER_NM, C.BIZR_NO, C.CEO_NM, C.BIZTP_NM, C.BIZC_NM," +
                " C.BASE_ADDR, C.DTL_ADDR2, C.TEL_NO, C.FAX_NO, NULL AS DEPT_CD, NULL AS DEPT_NM," +
                " C.INSERT_DTS, C.UPDATE_DTS" +
                " FROM CI_PARTNER_MST C" +
                " LEFT OUTER JOIN MA_PARTNER_MST M ON M.PARTNER_CD = C.PARTNER_CD" +
                " WHERE (C.PARTNER_CD LIKE '%' || ? || '%' OR C.PARTNER_NM LIKE '%' || ? || '%')" +
                " AND C.USE_YN = 'Y'" +
                " AND M.COMPANY_CD = '1000'" +
                " ORDER BY CASE WHEN TRIM(C.PARTNER_NM) = ? THEN 0" +
                "               WHEN C.PARTNER_NM LIKE ? || '%' THEN 1 ELSE 2 END," +
                "          LENGTH(C.PARTNER_NM), C.PARTNER_NM" +
                ") WHERE ROWNUM <= 30",
                ROW_MAPPER, kw, kw, kw, kw
        );
    }

    /**
     * 사업자관리 헤더 컬럼 → Oracle 컬럼식 화이트리스트.
     *
     * ★값이 MySQL(BusinessOwner) 로 override 되는 컬럼(담당부서/등록일/수정일)은 넣지 않는다.
     *   화면 표시값과 Oracle 값이 달라 정렬·필터 결과가 어긋나기 때문. (프론트도 그 컬럼은 막는다)
     * ★SQL 인젝션 방지 — 정렬/필터 컬럼은 반드시 이 맵을 거쳐야 하고, 값은 바인드 파라미터로만 넣는다.
     */
    private static final java.util.Map<String, String> PARTNER_SORT_COLS = java.util.Map.of(
            "companyName", "p.PARTNER_NM",
            "bizNo",       "p.BIZR_NO",
            "ceoNm",       "p.CEO_NM",
            "bizType",     "p.BIZTP_NM",
            "bizItem",     "p.BIZC_NM",
            "address",     "p.BASE_ADDR",
            "partnerCd",   "p.PARTNER_CD");

    /** 헤더 컬럼 필터 한 건 — 프론트 ColFilter 와 동일 구조(텍스트 전용). */
    public record PartnerColFilter(String colId, String op, List<String> values, Boolean excludeBlank) {}

    /** 공통 WHERE — 목록/건수가 같은 조건을 쓰도록 한 곳에서 만든다. */
    private void appendPartnerWhere(StringBuilder sql, java.util.List<Object> params,
                                    String keyword, Integer plantCd, Integer deptCd,
                                    List<PartnerColFilter> colFilters) {
        if (plantCd != null) {
            // ★공장 필터: 압축된 대표행(rn=1)의 PLANT_CD가 아니라, 그 거래처가 해당 공장 매출채널(DISCH_CD='2000')을
            //   한 건이라도 등록했는지(EXISTS)로 판정. (여러 공장 등록 거래처가 대표행이 타공장이면 GRP에서 누락되던 버그 수정)
            sql.append(" AND EXISTS (SELECT 1 FROM MA_PARTNERSA_INFO psi WHERE psi.PARTNER_CD = sa.PARTNER_CD" +
                    " AND psi.COMPANY_CD = '1000' AND psi.DISCH_CD = '2000' AND psi.PLANT_CD = ?)");
            params.add(String.valueOf(plantCd));
        }
        if (deptCd != null) {
            sql.append(" AND mcm.CC_CD = ?");
            params.add(String.valueOf(deptCd));
        }
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND p.PARTNER_NM LIKE '%' || ? || '%'");
            params.add(keyword);
        }
        appendColFilters(sql, params, colFilters, PARTNER_SORT_COLS);
    }

    /** 헤더 컬럼 필터 → WHERE. 컬럼은 화이트리스트로만 매핑하고 값은 바인드 파라미터로만 넣는다. */
    private void appendColFilters(StringBuilder sql, java.util.List<Object> params,
                                  List<PartnerColFilter> colFilters,
                                  java.util.Map<String, String> allowedCols) {
        if (colFilters == null) return;
        for (PartnerColFilter f : colFilters) {
            if (f == null || f.colId() == null) continue;
            String col = allowedCols.get(f.colId());
            if (col == null) continue;   // 화이트리스트 밖은 무시(서버 미지원 컬럼)
            if (Boolean.TRUE.equals(f.excludeBlank())) {
                // Oracle 은 '' 이 NULL 이라 `<> ''` 는 항상 거짓(0건) → TRIM(col) IS NOT NULL 로 공백만인 값까지 제외.
                sql.append(" AND TRIM(").append(col).append(") IS NOT NULL");
            }
            List<String> vals = f.values() == null ? List.of()
                    : f.values().stream().filter(v -> v != null && !v.isBlank()).map(String::trim).toList();
            if (vals.isEmpty()) continue;
            String op = f.op() == null ? "CONTAINS" : f.op().toUpperCase();
            if ("NOT_CONTAINS".equals(op)) {
                // 모든 검색어를 포함하지 않음(AND). NULL 도 통과시킨다(프론트는 빈 문자열로 취급).
                for (String v : vals) {
                    sql.append(" AND (").append(col).append(" IS NULL OR LOWER(").append(col)
                       .append(") NOT LIKE '%' || LOWER(?) || '%')");
                    params.add(v);
                }
            } else {
                // CONTAINS / EQUALS — 하나라도 맞으면 통과(OR)
                sql.append(" AND (");
                for (int i = 0; i < vals.size(); i++) {
                    if (i > 0) sql.append(" OR ");
                    if ("EQUALS".equals(op)) {
                        sql.append("LOWER(").append(col).append(") = LOWER(?)");
                    } else {
                        sql.append("LOWER(").append(col).append(") LIKE '%' || LOWER(?) || '%'");
                    }
                    params.add(vals.get(i));
                }
                sql.append(")");
            }
        }
    }

    /**
     * 페이징 검색 (keyword + plantCd + deptCd + 헤더 정렬/필터).
     *
     * ★ROW_NUMBER 로 offset~limit 구간만 잘라 온다. 예전엔 offset+limit 만큼 전부 받아
     *   자바에서 skip 했는데, 사업자관리가 전량조회(size=100000)라 1만 행을 통째로 전송해 느렸다.
     */
    public List<ErpPartnerDto> searchPaged(String keyword, Integer plantCd, Integer deptCd,
                                           int offset, int limit,
                                           String sortField, String sortDir,
                                           List<PartnerColFilter> colFilters) {
        StringBuilder sql = new StringBuilder("SELECT * FROM (SELECT q.*, ROWNUM rn FROM ("
                + BASE_SELECT + BASE_FROM + " WHERE 1=1");
        java.util.List<Object> params = new java.util.ArrayList<>();
        appendPartnerWhere(sql, params, keyword, plantCd, deptCd, colFilters);

        String orderCol = sortField != null ? PARTNER_SORT_COLS.get(sortField) : null;
        String dir = "desc".equalsIgnoreCase(sortDir) ? "DESC" : "ASC";
        // 정렬 안정성(페이지 경계 흔들림 방지) — 마지막에 거래처코드를 tie-breaker 로 붙인다.
        sql.append(orderCol != null
                ? " ORDER BY " + orderCol + " " + dir + ", p.PARTNER_CD ASC"
                : " ORDER BY p.PARTNER_NM ASC, p.PARTNER_CD ASC");
        sql.append(") q WHERE ROWNUM <= ?) WHERE rn > ?");
        params.add(offset + limit);
        params.add(offset);
        return jdbcTemplate.query(sql.toString(), ROW_MAPPER, params.toArray());
    }

    /** 전체 건수 (목록과 동일 조건 — 헤더 필터 포함) */
    public long countAll(String keyword, Integer plantCd, Integer deptCd, List<PartnerColFilter> colFilters) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(*) " + BASE_FROM + " WHERE 1=1");
        java.util.List<Object> params = new java.util.ArrayList<>();
        appendPartnerWhere(sql, params, keyword, plantCd, deptCd, colFilters);
        return jdbcTemplate.queryForObject(sql.toString(), Long.class, params.toArray());
    }

    /** 영업담당자관리 헤더 컬럼 → Oracle 컬럼식 화이트리스트(정렬·필터 공용). */
    private static final java.util.Map<String, String> PARTNER_FN_SORT_COLS = java.util.Map.of(
            "partnerCd",         "SPI.PARTNER_CD",
            "partnerNm",         "CPM.PARTNER_NM",
            "partnerBpDeptName", "MDM.DEPT_NM",
            "partnerBpName",     "HEM.KOR_NM",
            "defaultYn",         "COALESCE(SPI.DFLT_YN, 'N')");

    public List<ErpPartnerFunctionDto> searchPartnerFunctions(String keyword, String partnerCd,
                                                              String employeeNo, int offset, int limit,
                                                              String sortField, String sortDir,
                                                              List<PartnerColFilter> colFilters) {
        StringBuilder sql = new StringBuilder("""
                SELECT * FROM (
                  SELECT q.*, ROWNUM rn FROM (
                    SELECT
                        SPI.COMPANY_CD,
                        SPI.PARTNER_CD,
                        CPM.PARTNER_NM,
                        SPI.SALESORGN_CD,
                        SPI.DISCH_CD,
                        SPI.PRDUCTGRP_CD,
                        SPI.PRTNR_FN_CD,
                        SPI.PRTNR_CD,
                        HEM.DEPT_CD,
                        MDM.DEPT_NM,
                        HEM.KOR_NM AS NM_PARTNER_BP,
                        COALESCE(SPI.DFLT_YN, 'N') AS DFLT_YN
                    FROM SD_PARTNERFN_INFO SPI
                    LEFT OUTER JOIN CI_PARTNER_MST CPM
                           ON CPM.PARTNER_CD = SPI.PARTNER_CD
                    LEFT OUTER JOIN HR_EMP_MST HEM
                           ON HEM.COMPANY_CD = SPI.COMPANY_CD
                          AND HEM.EMP_NO     = SPI.PRTNR_CD
                    LEFT OUTER JOIN MA_DEPT_MST MDM
                           ON MDM.COMPANY_CD = HEM.COMPANY_CD
                          AND MDM.DEPT_CD    = HEM.DEPT_CD
                    WHERE SPI.COMPANY_CD   = '1000'
                      AND SPI.DISCH_CD     = '2000'
                      AND SPI.PRDUCTGRP_CD = '00'
                      AND SPI.PRTNR_FN_CD  = 'EMP'
                """);
        java.util.List<Object> params = new java.util.ArrayList<>();
        appendPartnerFunctionFilters(sql, params, keyword, partnerCd, employeeNo);
        appendColFilters(sql, params, colFilters, PARTNER_FN_SORT_COLS);

        String orderCol = sortField != null ? PARTNER_FN_SORT_COLS.get(sortField) : null;
        String dir = "desc".equalsIgnoreCase(sortDir) ? "DESC" : "ASC";
        // 정렬 안정성(페이지 경계 흔들림 방지) — 거래처코드를 tie-breaker 로 붙인다.
        sql.append(orderCol != null
                ? "    ORDER BY " + orderCol + " " + dir + ", SPI.PARTNER_CD ASC\n"
                : "    ORDER BY SPI.PARTNER_CD\n");
        sql.append("""
                  ) q WHERE ROWNUM <= ?
                ) WHERE rn > ?
                """);
        params.add(offset + limit);
        params.add(offset);
        return jdbcTemplate.query(sql.toString(), PARTNER_FUNCTION_ROW_MAPPER, params.toArray());
    }

    public long countPartnerFunctions(String keyword, String partnerCd, String employeeNo,
                                      List<PartnerColFilter> colFilters) {
        StringBuilder sql = new StringBuilder("""
                SELECT COUNT(*)
                    FROM SD_PARTNERFN_INFO SPI
                    LEFT OUTER JOIN HR_EMP_MST HEM
                           ON HEM.COMPANY_CD = SPI.COMPANY_CD
                          AND HEM.EMP_NO     = SPI.PRTNR_CD
                    LEFT OUTER JOIN CI_PARTNER_MST CPM
                           ON CPM.PARTNER_CD = SPI.PARTNER_CD
                    LEFT OUTER JOIN MA_DEPT_MST MDM
                           ON MDM.COMPANY_CD = HEM.COMPANY_CD
                          AND MDM.DEPT_CD    = HEM.DEPT_CD
                    WHERE SPI.COMPANY_CD   = '1000'
                      AND SPI.DISCH_CD     = '2000'
                      AND SPI.PRDUCTGRP_CD = '00'
                      AND SPI.PRTNR_FN_CD  = 'EMP'
                """);
        java.util.List<Object> params = new java.util.ArrayList<>();
        appendPartnerFunctionFilters(sql, params, keyword, partnerCd, employeeNo);
        appendColFilters(sql, params, colFilters, PARTNER_FN_SORT_COLS);
        return jdbcTemplate.queryForObject(sql.toString(), Long.class, params.toArray());
    }

    private void appendPartnerFunctionFilters(StringBuilder sql, java.util.List<Object> params,
                                              String keyword, String partnerCd, String employeeNo) {
        if (partnerCd != null && !partnerCd.isBlank()) {
            sql.append(" AND SPI.PARTNER_CD = ?");
            params.add(partnerCd);
        }
        if (employeeNo != null && !employeeNo.isBlank()) {
            sql.append(" AND SPI.PRTNR_CD = ?");
            params.add(employeeNo);
        }
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND (SPI.PARTNER_CD LIKE '%' || ? || '%' OR CPM.PARTNER_NM LIKE '%' || ? || '%' OR SPI.PRTNR_CD LIKE '%' || ? || '%' OR HEM.KOR_NM LIKE '%' || ? || '%' OR MDM.DEPT_NM LIKE '%' || ? || '%')");
            params.add(keyword);
            params.add(keyword);
            params.add(keyword);
            params.add(keyword);
            params.add(keyword);
        }
    }

    /** 매출처(MA_PARTNERSA_INFO) 페이징 검색 - 거래처별 담당자 전체 (담당자 수만큼 행 반환).
     *  PR-31 시트 정정 — MA_PARTNER_MST JOIN 추가로 SUBO_NO(종사업자번호) 노출,
     *  CI_PARTNER_MST.POST_NO(우편번호) + INSERT_DTS/UPDATE_DTS 추가, 담당자 USE_YN='Y' 필터. */
    /**
     * 고객관리 헤더 컬럼 → Oracle 컬럼식 화이트리스트.
     * ★SQL 인젝션 방지 — 정렬/필터 컬럼은 반드시 이 맵을 거치고, 값은 바인드 파라미터로만 넣는다.
     */
    private static final java.util.Map<String, String> CUSTOMER_SORT_COLS = java.util.Map.of(
            "companyName",     "p.PARTNER_NM",
            "contactName",     "ptr.ASGNR_NM",
            "contactDept",     "ptr.ASGNR_DEPT_NM",
            "contactPosition", "ptr.ASGNR_ODTY_NM",
            "contactEmail",    "ptr.ASGNR_EMAIL_NM",
            "contactPhone",    "ptr.ASGNR_HP_NO",
            "partnerCd",       "p.PARTNER_CD");

    /** 고객관리 공통 WHERE — 목록/건수가 같은 조건을 쓰도록 한 곳에서 만든다. */
    private void appendCustomerWhere(StringBuilder sql, java.util.List<Object> params,
                                     String keyword, List<PartnerColFilter> colFilters) {
        if (keyword != null && !keyword.isBlank()) {
            sql.append(" AND (p.PARTNER_NM LIKE '%' || ? || '%' OR p.PARTNER_CD LIKE '%' || ? || '%' OR p.BIZR_NO LIKE '%' || ? || '%')");
            params.add(keyword); params.add(keyword); params.add(keyword);
        }
        appendColFilters(sql, params, colFilters, CUSTOMER_SORT_COLS);
    }

    public List<ErpPartnerDto> searchSalesCustomersPaged(String keyword, int offset, int limit,
                                                         String sortField, String sortDir,
                                                         List<PartnerColFilter> colFilters) {
        StringBuilder sql = new StringBuilder("""
                SELECT * FROM (SELECT q.*, ROWNUM rn FROM (
                  SELECT p.PARTNER_CD, p.PARTNER_NM, p.BIZR_NO, p.CEO_NM, p.BIZTP_NM, p.BIZC_NM, p.BASE_ADDR, p.DTL_ADDR2, p.TEL_NO, p.FAX_NO,
                         p.POST_NO, p.INSERT_DTS, p.UPDATE_DTS, m.SUBO_NO,
                         ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, ptr.ASGNR_ODTY_NM, ptr.ASGNR_HP_NO, ptr.ASGNR_TEL_NO, ptr.ASGNR_EMAIL_NM
                    FROM (
                      SELECT DISTINCT PARTNER_CD FROM MA_PARTNERSA_INFO WHERE COMPANY_CD = '1000'
                    ) sa
                    JOIN CI_PARTNER_MST p ON sa.PARTNER_CD = p.PARTNER_CD
                    LEFT JOIN MA_PARTNER_MST m
                      ON m.PARTNER_CD = sa.PARTNER_CD AND m.COMPANY_CD = '1000'
                    LEFT JOIN MA_PARTNER_PTR ptr
                      ON ptr.PARTNER_CD = sa.PARTNER_CD AND ptr.COMPANY_CD = '1000'
                   WHERE p.USE_YN = 'Y'
                """);
        java.util.List<Object> params = new java.util.ArrayList<>();
        appendCustomerWhere(sql, params, keyword, colFilters);

        String orderCol = sortField != null ? CUSTOMER_SORT_COLS.get(sortField) : null;
        String dir = "desc".equalsIgnoreCase(sortDir) ? "DESC" : "ASC";
        sql.append(orderCol != null
                ? " ORDER BY " + orderCol + " " + dir + ", p.PARTNER_CD ASC, ptr.PARTNER_ASGNR_SQ NULLS LAST"
                : " ORDER BY p.PARTNER_NM, ptr.PARTNER_ASGNR_SQ NULLS LAST");
        // ★offset~limit 구간만 잘라 온다(예전엔 offset+limit 전부 받아 자바에서 skip → 전량조회 시 매우 느림).
        sql.append(") q WHERE ROWNUM <= ?) WHERE rn > ?");
        params.add(offset + limit);
        params.add(offset);
        return jdbcTemplate.query(sql.toString(), SALES_ROW_MAPPER, params.toArray());
    }

    /** 특정 partnerCd의 담당자 목록 직접 조회 (MA_PARTNERSA_INFO 조인 없이). PR-31 컬럼 확장 동기화. */
    public List<ErpPartnerDto> findContactsByPartnerCd(String partnerCd) {
        return jdbcTemplate.query("""
                SELECT p.PARTNER_CD, p.PARTNER_NM, p.BIZR_NO, p.CEO_NM, p.BIZTP_NM, p.BIZC_NM,
                       p.BASE_ADDR, p.DTL_ADDR2, p.TEL_NO, p.FAX_NO,
                       p.POST_NO, p.INSERT_DTS, p.UPDATE_DTS, m.SUBO_NO,
                       ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, ptr.ASGNR_ODTY_NM,
                       ptr.ASGNR_HP_NO, ptr.ASGNR_TEL_NO, ptr.ASGNR_EMAIL_NM
                  FROM CI_PARTNER_MST p
                  LEFT JOIN MA_PARTNER_MST m
                    ON m.PARTNER_CD = p.PARTNER_CD AND m.COMPANY_CD = '1000'
                  LEFT JOIN MA_PARTNER_PTR ptr
                    ON ptr.PARTNER_CD = p.PARTNER_CD AND ptr.COMPANY_CD = '1000'
                 WHERE p.PARTNER_CD = ?
                 ORDER BY ptr.PARTNER_ASGNR_SQ NULLS LAST
                """,
                SALES_ROW_MAPPER, partnerCd
        );
    }

    /** 매출처 전체 건수 (담당자 행 기준) */
    public long countSalesCustomers(String keyword, List<PartnerColFilter> colFilters) {
        StringBuilder sql = new StringBuilder("""
                SELECT COUNT(*) FROM (
                  SELECT p.PARTNER_CD
                    FROM (SELECT DISTINCT PARTNER_CD FROM MA_PARTNERSA_INFO WHERE COMPANY_CD = '1000') sa
                    JOIN CI_PARTNER_MST p ON sa.PARTNER_CD = p.PARTNER_CD
                    LEFT JOIN MA_PARTNER_PTR ptr
                      ON ptr.PARTNER_CD = sa.PARTNER_CD AND ptr.COMPANY_CD = '1000'
                   WHERE p.USE_YN = 'Y'
                """);
        java.util.List<Object> params = new java.util.ArrayList<>();
        appendCustomerWhere(sql, params, keyword, colFilters);
        sql.append(")");
        return jdbcTemplate.queryForObject(sql.toString(), Long.class, params.toArray());
    }

    /** Oracle 테이블 컬럼 목록 조회 (진단용) */
    public List<String> getTableColumns(String tableName) {
        return jdbcTemplate.queryForList(
                "SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = ? ORDER BY COLUMN_ID",
                String.class, tableName
        );
    }

    /** 테이블명/컬럼명 패턴으로 Oracle 테이블 검색 (진단용) */
    public List<java.util.Map<String, String>> findTablesByPattern(String tablePattern, String columnPattern) {
        StringBuilder sql = new StringBuilder(
                "SELECT TABLE_NAME, COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE 1=1");
        java.util.List<Object> params = new java.util.ArrayList<>();
        if (tablePattern != null && !tablePattern.isBlank()) {
            sql.append(" AND TABLE_NAME LIKE '%' || ? || '%'");
            params.add(tablePattern);
        }
        if (columnPattern != null && !columnPattern.isBlank()) {
            sql.append(" AND COLUMN_NAME LIKE '%' || ? || '%'");
            params.add(columnPattern);
        }
        sql.append(" AND ROWNUM <= 200 ORDER BY TABLE_NAME, COLUMN_ID");
        try {
            return jdbcTemplate.queryForList(sql.toString(), params.toArray())
                    .stream().map(row -> {
                        java.util.Map<String, String> m = new java.util.LinkedHashMap<>();
                        m.put("tableName", String.valueOf(row.get("TABLE_NAME")));
                        m.put("columnName", String.valueOf(row.get("COLUMN_NAME")));
                        return m;
                    }).collect(java.util.stream.Collectors.toList());
        } catch (Exception e) {
            return java.util.List.of(java.util.Map.of("error", e.getMessage()));
        }
    }

    /** 업태 자동완성 (오라클 DB) */
    public List<String> findDistinctBizTypes(String keyword) {
        return jdbcTemplate.queryForList(
                """
                SELECT DISTINCT BIZTP_NM
                  FROM CI_PARTNER_MST
                 WHERE USE_YN = 'Y'
                   AND BIZTP_NM IS NOT NULL
                   AND BIZTP_NM LIKE '%' || ? || '%'
                 ORDER BY BIZTP_NM
                """,
                String.class, keyword
        );
    }

    /** 종목 자동완성 (오라클 DB) */
    public List<String> findDistinctBizItems(String keyword) {
        return jdbcTemplate.queryForList(
                """
                SELECT DISTINCT BIZC_NM
                  FROM CI_PARTNER_MST
                 WHERE USE_YN = 'Y'
                   AND BIZC_NM IS NOT NULL
                   AND BIZC_NM LIKE '%' || ? || '%'
                 ORDER BY BIZC_NM
                """,
                String.class, keyword
        );
    }

    /** 담당부서 체인 진단 - 각 JOIN 단계별로 Oracle 데이터 상태 확인 */
    public java.util.Map<String, Object> diagnoseDeptChain() {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        try {
            // 1. CI_PARTNER_MST 총 활성 거래처 수
            result.put("partner_active_count", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM CI_PARTNER_MST WHERE USE_YN = 'Y'", Long.class));

            // 2. MA_PARTNERSA_INFO COMPANY_CD 별 건수 (실제 COMPANY_CD 값 확인)
            result.put("sa_company_cds", jdbcTemplate.queryForList(
                "SELECT COMPANY_CD, COUNT(*) CNT FROM MA_PARTNERSA_INFO GROUP BY COMPANY_CD ORDER BY CNT DESC"));

            // 3. MA_PARTNERSA_INFO 레코드 수 (COMPANY_CD='1000')
            result.put("sa_count_1000", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM MA_PARTNERSA_INFO WHERE COMPANY_CD = '1000'", Long.class));

            // 4. BIZRSPT_EMPNO_CD 있는 레코드 수 (COMPANY_CD='1000')
            result.put("sa_with_empno_count", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM MA_PARTNERSA_INFO WHERE COMPANY_CD = '1000' AND BIZRSPT_EMPNO_CD IS NOT NULL AND BIZRSPT_EMPNO_CD != ' '", Long.class));

            // 5. HR_EMP_MST COMPANY_CD 별 건수
            result.put("emp_company_cds", jdbcTemplate.queryForList(
                "SELECT COMPANY_CD, COUNT(*) CNT FROM HR_EMP_MST GROUP BY COMPANY_CD ORDER BY CNT DESC"));

            // 6. HR_EMP_MST에서 DEPT_CD 있는 사원 수
            result.put("emp_with_dept_count", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM HR_EMP_MST WHERE COMPANY_CD = '1000' AND DEPT_CD IS NOT NULL", Long.class));

            // 7. VW_MA_DEPT_MST 총 부서 수
            result.put("dept_count", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM VW_MA_DEPT_MST WHERE COMPANY_CD = '1000'", Long.class));

            // 8. 최종: 담당부서 JOIN 성공 거래처 수 (INNER JOIN)
            result.put("partner_with_dept_count", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM CI_PARTNER_MST p " +
                "JOIN MA_PARTNERSA_INFO sa ON p.PARTNER_CD = sa.PARTNER_CD AND sa.COMPANY_CD = '1000' " +
                "JOIN HR_EMP_MST h ON sa.BIZRSPT_EMPNO_CD = h.EMP_NO AND h.COMPANY_CD = '1000' " +
                "JOIN VW_MA_DEPT_MST d ON h.DEPT_CD = d.DEPT_CD AND d.COMPANY_CD = '1000' " +
                "WHERE p.USE_YN = 'Y'", Long.class));

            // 9. 샘플 5건 - BIZRSPT_EMPNO_CD 값 확인용
            result.put("sample_with_empno", jdbcTemplate.queryForList(
                "SELECT p.PARTNER_CD, p.PARTNER_NM, sa.BIZRSPT_EMPNO_CD, h.DEPT_CD, d.DEPT_NM " +
                "FROM CI_PARTNER_MST p " +
                "LEFT JOIN MA_PARTNERSA_INFO sa ON p.PARTNER_CD = sa.PARTNER_CD AND sa.COMPANY_CD = '1000' " +
                "LEFT JOIN HR_EMP_MST h ON sa.BIZRSPT_EMPNO_CD = h.EMP_NO AND h.COMPANY_CD = '1000' " +
                "LEFT JOIN VW_MA_DEPT_MST d ON h.DEPT_CD = d.DEPT_CD AND d.COMPANY_CD = '1000' " +
                "WHERE p.USE_YN = 'Y' AND ROWNUM <= 5"));

            // 10. MA_PARTNERSA_INFO 컬럼 목록 중 EMPNO 관련만
            result.put("sa_empno_sample", jdbcTemplate.queryForList(
                "SELECT PARTNER_CD, BIZRSPT_EMPNO_CD FROM MA_PARTNERSA_INFO WHERE COMPANY_CD = '1000' AND ROWNUM <= 5"));

        } catch (Exception e) {
            result.put("error", e.getMessage());
        }
        return result;
    }

    /** MA_PARTNER_PTR 및 VW_MA_PARTNER_MST 기반 담당부서 진단 */
    public java.util.Map<String, Object> diagnosePartnerPtr() {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        try {
            // 1. MA_PARTNER_PTR 레코드 수
            result.put("ptr_total", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM MA_PARTNER_PTR WHERE COMPANY_CD = '1000'", Long.class));

            // 2. ASGNR_DEPT_NM 있는 건수
            result.put("ptr_with_dept_nm", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM MA_PARTNER_PTR WHERE COMPANY_CD = '1000' AND ASGNR_DEPT_NM IS NOT NULL AND ASGNR_DEPT_NM != ' '", Long.class));

            // 3. RSPT_TP_CD 별 건수 (책임 타입)
            result.put("ptr_rspt_tp_dist", jdbcTemplate.queryForList(
                "SELECT RSPT_TP_CD, COUNT(*) CNT FROM MA_PARTNER_PTR WHERE COMPANY_CD = '1000' GROUP BY RSPT_TP_CD ORDER BY CNT DESC"));

            // 4. 샘플 5건
            result.put("ptr_samples", jdbcTemplate.queryForList(
                "SELECT ptr.PARTNER_CD, p.PARTNER_NM, ptr.RSPT_TP_CD, ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, ptr.PUR_PRMR_ASGNR_YN " +
                "FROM MA_PARTNER_PTR ptr JOIN CI_PARTNER_MST p ON ptr.PARTNER_CD = p.PARTNER_CD " +
                "WHERE ptr.COMPANY_CD = '1000' AND ptr.ASGNR_DEPT_NM IS NOT NULL AND ROWNUM <= 5"));

            // 5. VW_MA_PARTNER_MST 샘플 (ASGNR_DEPT_NM 있는 것)
            result.put("vw_partner_samples", jdbcTemplate.queryForList(
                "SELECT PARTNER_CD, PARTNER_NM, ASGNR_NM, ASGNR_DEPT_NM " +
                "FROM VW_MA_PARTNER_MST WHERE COMPANY_CD = '1000' AND ASGNR_DEPT_NM IS NOT NULL AND ROWNUM <= 5"));

            // 6. VW_MA_PARTNER_MST 총 건수 vs ASGNR_DEPT_NM 있는 건수
            result.put("vw_total", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM VW_MA_PARTNER_MST WHERE COMPANY_CD = '1000'", Long.class));
            result.put("vw_with_dept_nm", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM VW_MA_PARTNER_MST WHERE COMPANY_CD = '1000' AND ASGNR_DEPT_NM IS NOT NULL AND ASGNR_DEPT_NM != ' '", Long.class));

        } catch (Exception e) {
            result.put("error", e.getMessage());
        }
        return result;
    }

    /** MA_PARTNER_PTR RSPT_TP_CD 타입별 내부/외부 담당자 구분 + HR_EMP_MST 교차 확인 */
    public java.util.Map<String, Object> diagnoseRsptType() {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        try {
            // 1. RSPT_TP_CD='1' 샘플 (가장 많은 타입)
            result.put("rspt1_samples", jdbcTemplate.queryForList(
                "SELECT ptr.PARTNER_CD, p.PARTNER_NM, ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, ptr.PUR_PRMR_ASGNR_YN " +
                "FROM MA_PARTNER_PTR ptr JOIN CI_PARTNER_MST p ON ptr.PARTNER_CD = p.PARTNER_CD " +
                "WHERE ptr.COMPANY_CD = '1000' AND ptr.RSPT_TP_CD = '1' AND ptr.ASGNR_DEPT_NM IS NOT NULL AND ROWNUM <= 3"));

            // 2. RSPT_TP_CD='2' 샘플
            result.put("rspt2_samples", jdbcTemplate.queryForList(
                "SELECT ptr.PARTNER_CD, p.PARTNER_NM, ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, ptr.PUR_PRMR_ASGNR_YN " +
                "FROM MA_PARTNER_PTR ptr JOIN CI_PARTNER_MST p ON ptr.PARTNER_CD = p.PARTNER_CD " +
                "WHERE ptr.COMPANY_CD = '1000' AND ptr.RSPT_TP_CD = '2' AND ROWNUM <= 3"));

            // 3. RSPT_TP_CD='3' 샘플
            result.put("rspt3_samples", jdbcTemplate.queryForList(
                "SELECT ptr.PARTNER_CD, p.PARTNER_NM, ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, ptr.PUR_PRMR_ASGNR_YN " +
                "FROM MA_PARTNER_PTR ptr JOIN CI_PARTNER_MST p ON ptr.PARTNER_CD = p.PARTNER_CD " +
                "WHERE ptr.COMPANY_CD = '1000' AND ptr.RSPT_TP_CD = '3' AND ROWNUM <= 3"));

            // 4. MA_PARTNER_PTR.ASGNR_NM이 우리 회사(HR_EMP_MST) 직원명과 일치하는 건수
            result.put("ptr_nm_match_emp_count", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM MA_PARTNER_PTR ptr " +
                "JOIN HR_EMP_MST h ON ptr.ASGNR_NM = h.KOR_NM AND h.COMPANY_CD = '1000' " +
                "WHERE ptr.COMPANY_CD = '1000'", Long.class));

            // 5. 우리 회사 직원과 이름이 일치하는 담당자 샘플
            result.put("ptr_internal_samples", jdbcTemplate.queryForList(
                "SELECT ptr.PARTNER_CD, p.PARTNER_NM, ptr.RSPT_TP_CD, ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, h.DEPT_CD, d.DEPT_NM AS INTERNAL_DEPT_NM " +
                "FROM MA_PARTNER_PTR ptr " +
                "JOIN CI_PARTNER_MST p ON ptr.PARTNER_CD = p.PARTNER_CD " +
                "JOIN HR_EMP_MST h ON ptr.ASGNR_NM = h.KOR_NM AND h.COMPANY_CD = '1000' " +
                "LEFT JOIN VW_MA_DEPT_MST d ON h.DEPT_CD = d.DEPT_CD AND d.COMPANY_CD = '1000' " +
                "WHERE ptr.COMPANY_CD = '1000' AND ROWNUM <= 5"));

        } catch (Exception e) {
            result.put("error", e.getMessage());
        }
        return result;
    }

    /** ASGNR_DEPT_NM vs VW_MA_DEPT_MST 교차 확인 */
    public java.util.Map<String, Object> diagnoseAsgnrDeptMatch() {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        try {
            // 1. VW_MA_DEPT_MST 부서 목록 전체
            result.put("internal_depts", jdbcTemplate.queryForList(
                "SELECT DEPT_CD, DEPT_NM FROM VW_MA_DEPT_MST WHERE COMPANY_CD = '1000' ORDER BY DEPT_NM"));

            // 2. MA_PARTNER_PTR.ASGNR_DEPT_NM이 VW_MA_DEPT_MST.DEPT_NM과 일치하는 건수
            result.put("asgnr_dept_matches_internal", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM MA_PARTNER_PTR ptr " +
                "JOIN VW_MA_DEPT_MST d ON ptr.ASGNR_DEPT_NM = d.DEPT_NM AND d.COMPANY_CD = '1000' " +
                "WHERE ptr.COMPANY_CD = '1000'", Long.class));

            // 3. 일치하는 경우 샘플
            result.put("matching_samples", jdbcTemplate.queryForList(
                "SELECT ptr.PARTNER_CD, p.PARTNER_NM, ptr.ASGNR_NM, ptr.ASGNR_DEPT_NM, d.DEPT_CD " +
                "FROM MA_PARTNER_PTR ptr " +
                "JOIN CI_PARTNER_MST p ON ptr.PARTNER_CD = p.PARTNER_CD " +
                "JOIN VW_MA_DEPT_MST d ON ptr.ASGNR_DEPT_NM = d.DEPT_NM AND d.COMPANY_CD = '1000' " +
                "WHERE ptr.COMPANY_CD = '1000' AND ROWNUM <= 5"));

            // 4. HR_EMP_MST를 통한 내부 직원 매핑 (이름 기준) - 거래처별 1건 집계
            result.put("partner_internal_dept_count", jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT ptr.PARTNER_CD) FROM MA_PARTNER_PTR ptr " +
                "JOIN HR_EMP_MST h ON ptr.ASGNR_NM = h.KOR_NM AND h.COMPANY_CD = '1000' " +
                "JOIN VW_MA_DEPT_MST d ON h.DEPT_CD = d.DEPT_CD AND d.COMPANY_CD = '1000' " +
                "WHERE ptr.COMPANY_CD = '1000'", Long.class));

        } catch (Exception e) {
            result.put("error", e.getMessage());
        }
        return result;
    }

    /** SS_PARTNER_MST 기반 담당부서 진단 */
    public java.util.Map<String, Object> diagnoseSsPartner() {
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        try {
            // 1. SS_PARTNER_MST 레코드 수
            result.put("ss_total", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM SS_PARTNER_MST WHERE COMPANY_CD = '1000'", Long.class));

            // 2. BIZ_DEPT_CD 있는 건수
            result.put("ss_with_dept_cd", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM SS_PARTNER_MST WHERE COMPANY_CD = '1000' AND BIZ_DEPT_CD IS NOT NULL AND BIZ_DEPT_CD != ' '", Long.class));

            // 3. BIZ_EMP_NO 있는 건수
            result.put("ss_with_emp_no", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM SS_PARTNER_MST WHERE COMPANY_CD = '1000' AND BIZ_EMP_NO IS NOT NULL AND BIZ_EMP_NO != ' '", Long.class));

            // 4. 샘플 5건 (BIZ_DEPT_CD 있는 것만)
            result.put("ss_dept_samples", jdbcTemplate.queryForList(
                "SELECT p.PARTNER_NM, ss.PARTNER_CD, ss.BIZ_DEPT_CD, ss.BIZ_EMP_NO, d.DEPT_NM " +
                "FROM SS_PARTNER_MST ss " +
                "JOIN CI_PARTNER_MST p ON ss.PARTNER_CD = p.PARTNER_CD " +
                "LEFT JOIN VW_MA_DEPT_MST d ON ss.BIZ_DEPT_CD = d.DEPT_CD AND d.COMPANY_CD = '1000' " +
                "WHERE ss.COMPANY_CD = '1000' AND ss.BIZ_DEPT_CD IS NOT NULL AND ROWNUM <= 5"));

            // 5. CI_PARTNER_MST 기준으로 SS_PARTNER_MST JOIN 성공 건수
            result.put("partner_with_ss_dept", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM CI_PARTNER_MST p " +
                "JOIN SS_PARTNER_MST ss ON p.PARTNER_CD = ss.PARTNER_CD AND ss.COMPANY_CD = '1000' " +
                "JOIN VW_MA_DEPT_MST d ON ss.BIZ_DEPT_CD = d.DEPT_CD AND d.COMPANY_CD = '1000' " +
                "WHERE p.USE_YN = 'Y'", Long.class));

            // 6. BIZ_EMP_NO → HR_EMP_MST → DEPT_CD 체인 성공 건수
            result.put("partner_with_emp_dept", jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM CI_PARTNER_MST p " +
                "JOIN SS_PARTNER_MST ss ON p.PARTNER_CD = ss.PARTNER_CD AND ss.COMPANY_CD = '1000' " +
                "JOIN HR_EMP_MST h ON ss.BIZ_EMP_NO = h.EMP_NO AND h.COMPANY_CD = '1000' " +
                "JOIN VW_MA_DEPT_MST d ON h.DEPT_CD = d.DEPT_CD AND d.COMPANY_CD = '1000' " +
                "WHERE p.USE_YN = 'Y'", Long.class));

        } catch (Exception e) {
            result.put("error", e.getMessage());
        }
        return result;
    }

    /** Oracle 연결 상태 확인 */
    public boolean ping() {
        try {
            jdbcTemplate.queryForObject("SELECT 1 FROM DUAL", Integer.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 활성 거래처 건수 */
    public long countActive() {
        try {
            Long cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM CI_PARTNER_MST WHERE USE_YN = 'Y'", Long.class);
            return cnt != null ? cnt : 0L;
        } catch (Exception e) {
            return -1L;
        }
    }

    /** 샘플 데이터 1건 (연결/쿼리 검증용) */
    public ErpPartnerDto findFirst() {
        try {
            List<ErpPartnerDto> result = jdbcTemplate.query(
                    BASE_SELECT + BASE_FROM + " AND ROWNUM = 1",
                    ROW_MAPPER);
            return result.isEmpty() ? null : result.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * [임시 진단] 특정 거래처코드의 사업자번호 해소가 왜 실패하는지 한 번에 확인.
     * 핵심: 백엔드가 붙은 Oracle 이 운영인지(jdbc_url/db_identity) + 각 소스에 실제 데이터가 있는지.
     * 검증 후 제거 대상.
     */
    public java.util.Map<String, Object> diagnoseBizNo(String partnerCd) {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        String cd = partnerCd == null ? "" : partnerCd.trim();
        m.put("input_cd", cd);
        m.put("input_len", cd.length());
        // ── 어느 Oracle 인가 (운영 vs 개발 판별) ──
        try { m.put("jdbc_url", jdbcTemplate.execute(
                (org.springframework.jdbc.core.ConnectionCallback<String>) c -> c.getMetaData().getURL())); }
        catch (Exception e) { m.put("jdbc_url_err", e.getMessage()); }
        try {
            m.put("db_identity", jdbcTemplate.queryForMap(
                "SELECT SYS_CONTEXT('USERENV','DB_NAME') AS DB_NAME, " +
                "SYS_CONTEXT('USERENV','SERVER_HOST') AS SERVER_HOST, " +
                "SYS_CONTEXT('USERENV','SERVICE_NAME') AS SERVICE_NAME, " +
                "SYS_CONTEXT('USERENV','CURRENT_USER') AS CURRENT_USER, " +
                "SYS_CONTEXT('USERENV','IP_ADDRESS') AS IP_ADDRESS FROM DUAL"));
        } catch (Exception e) { m.put("db_identity_err", e.getMessage()); }
        // ── 각 소스 원시 결과 ──
        try { m.put("ci_direct", jdbcTemplate.queryForList(
            "SELECT PARTNER_CD, BIZR_NO, PARTNER_NM, USE_YN FROM CI_PARTNER_MST WHERE TRIM(PARTNER_CD) = TRIM(?)", cd)); }
        catch (Exception e) { m.put("ci_direct_err", e.getMessage()); }
        try { m.put("sa_info", jdbcTemplate.queryForList(
            "SELECT PARTNER_CD, COMPANY_CD, DISCH_CD, PLANT_CD FROM MA_PARTNERSA_INFO WHERE TRIM(PARTNER_CD) = TRIM(?)", cd)); }
        catch (Exception e) { m.put("sa_info_err", e.getMessage()); }
        // ── 실제 해소 함수 결과 ──
        try { m.put("findBizNoByPartnerCd", findBizNoByPartnerCd(cd)); }
        catch (Exception e) { m.put("findBizNoByPartnerCd_err", e.getMessage()); }
        try {
            ErpPartnerDto d = findByPartnerCd(cd);
            m.put("findByPartnerCd_bizrNo", d != null ? d.getBizrNo() : null);
            m.put("findByPartnerCd_name", d != null ? d.getPartnerNm() : null);
        } catch (Exception e) { m.put("findByPartnerCd_err", e.getMessage()); }
        return m;
    }

    /** deptCd로 부서명 조회 */
    public String findDeptNameByCode(Integer deptCd) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT DEPT_NM FROM VW_MA_DEPT_MST WHERE COMPANY_CD = '1000' AND DEPT_CD = ?",
                    String.class, String.valueOf(deptCd));
        } catch (Exception e) {
            return null;
        }
    }
}
