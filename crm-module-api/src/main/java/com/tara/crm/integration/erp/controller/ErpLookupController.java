package com.tara.crm.integration.erp.controller;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.entity.BusinessOwner;
import com.tara.crm.info.repository.BusinessOwnerRepository;
import com.tara.crm.integration.erp.dto.ErpEmployeeDto;
import com.tara.crm.integration.erp.dto.ErpItemDto;
import com.tara.crm.integration.erp.dto.ErpPartnerDto;
import com.tara.crm.integration.erp.dto.ErpPlantDto;
import com.tara.crm.integration.erp.repository.ErpCodeRepository;
import com.tara.crm.integration.erp.repository.ErpDepartmentRepository;
import com.tara.crm.integration.erp.repository.ErpEmployeeRepository;
import com.tara.crm.integration.erp.repository.ErpItemRepository;
import com.tara.crm.integration.erp.repository.ErpPartnerRepository;
import com.tara.crm.integration.erp.repository.ErpPlantRepository;
import com.tara.crm.integration.erp.repository.ErpSyncLogRepository;
import com.tara.crm.integration.erp.service.ErpMasterSyncService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@Tag(name = "ERP Lookup", description = "ERP 마스터 데이터 조회 API")
@Slf4j
@RestController
@RequestMapping("/api/lookup")
@RequiredArgsConstructor
public class ErpLookupController {

    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final BusinessOwnerRepository businessOwnerRepository;
    private final Optional<ErpPartnerRepository> erpPartnerRepository;
    private final Optional<ErpItemRepository> erpItemRepository;
    private final Optional<ErpDepartmentRepository> erpDepartmentRepository;
    private final Optional<ErpEmployeeRepository> erpEmployeeRepository;
    private final Optional<ErpPlantRepository> erpPlantRepository;
    private final Optional<ErpMasterSyncService> erpMasterSyncService;
    private final Optional<ErpCodeRepository> erpCodeRepository;
    private final ErpSyncLogRepository erpSyncLogRepository;

    @Operation(summary = "거래처 검색 (Oracle ERP 우선, MySQL 폴백)")
    @GetMapping("/partners")
    public ApiResponse<List<Map<String, String>>> searchPartners(
            @RequestParam(required = false, defaultValue = "") String keyword) {
        // Oracle 우선 조회 (빈 키워드도 findByKeyword로 처리, ROWNUM 20 제한 적용)
        if (erpPartnerRepository.isPresent()) {
            try {
                List<ErpPartnerDto> partners = erpPartnerRepository.get().findByKeyword(keyword);
                if (!partners.isEmpty()) {
                    // 같은 (거래처코드+사업자번호) 중복 행 제거 — ERP 조인 fan-out 으로 동일 거래처가 여러 번 내려오는 것 방지.
                    //   거래처명이 같아도 사업자번호가 다르면 별개로 유지(예: '대승기업' 사업자번호 2개는 둘 다 표시).
                    java.util.Set<String> seenKeys = new java.util.LinkedHashSet<>();
                    List<Map<String, String>> result = partners.stream()
                            .filter(p -> seenKeys.add(
                                    (p.getPartnerCd() == null ? "" : p.getPartnerCd().trim())
                                    + "|" + (p.getBizrNo() == null ? "" : p.getBizrNo().replaceAll("\\D", ""))))
                            .map(p -> {
                                Map<String, String> m = new LinkedHashMap<>();
                                m.put("partnerCd", p.getPartnerCd());
                                m.put("partnerNm", p.getPartnerNm());
                                m.put("bizrNo", p.getBizrNo());
                                m.put("ceoNm", p.getCeoNm());
                                m.put("bizType", p.getBiztpNm());
                                m.put("bizItem", p.getBizcNm());
                                return m;
                            })
                            .collect(Collectors.toList());
                    return ApiResponse.ok(result);
                }
            } catch (Exception e) {
                log.warn("Oracle 거래처 조회 실패, MySQL fallback: {}", e.getMessage());
            }
        }
        // MySQL 폴백: BusinessOwner 테이블 사용
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        if (companyCd == null) companyCd = 1000;
        List<BusinessOwner> owners = keyword.isBlank()
                ? businessOwnerRepository.findAll()
                : businessOwnerRepository.searchByKeyword(companyCd, keyword);
        List<Map<String, String>> result = owners.stream()
                .map(b -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("partnerCd", b.getPartnerCd() != null ? b.getPartnerCd() : "");
                    m.put("partnerNm", b.getCompanyName() != null ? b.getCompanyName() : "");
                    m.put("bizrNo", b.getBizNo() != null ? b.getBizNo() : "");
                    m.put("ceoNm", b.getRepresentativeName() != null ? b.getRepresentativeName() : "");
                    m.put("bizType", b.getBizType() != null ? b.getBizType() : "");
                    m.put("bizItem", b.getBizItem() != null ? b.getBizItem() : "");
                    return m;
                })
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    /**
     * 시트 5/13 — 세금계산서발행 거래처 자동매핑 endpoint.
     * 사업자번호/상호/대표자/우편번호/주소/상세주소/업태/종목/종사업장번호/담당자(이름/부서/이메일/휴대폰/내선) 일괄 반환.
     */
    @Operation(summary = "거래처 단건 풀조회 (세금계산서발행 자동매핑용)")
    @GetMapping("/partners/{partnerCd}/full")
    public ApiResponse<Map<String, Object>> getPartnerFull(@PathVariable String partnerCd) {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Collections.emptyMap());
        }
        ErpPartnerDto p = erpPartnerRepository.get().findFullByPartnerCd(partnerCd);
        if (p == null) {
            // Oracle 못 찾으면 MySQL fallback
            Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
            if (companyCd == null) companyCd = 1000;
            BusinessOwner b = businessOwnerRepository
                    .findByCompanyCdAndPartnerCd(companyCd, partnerCd)
                    .orElse(null);
            if (b == null) return ApiResponse.ok(Collections.emptyMap());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("partnerCd", b.getPartnerCd());
            m.put("partnerNm", b.getCompanyName());
            m.put("bizrNo", b.getBizNo());
            m.put("ceoNm", b.getRepresentativeName());
            m.put("biztpNm", b.getBizType());
            m.put("bizcNm", b.getBizItem());
            m.put("baseAddr", b.getAddress());
            return ApiResponse.ok(m);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("partnerCd", p.getPartnerCd());
        m.put("partnerNm", p.getPartnerNm());
        m.put("bizrNo", p.getBizrNo());
        m.put("ceoNm", p.getCeoNm());
        m.put("biztpNm", p.getBiztpNm());
        m.put("bizcNm", p.getBizcNm());
        m.put("postNo", p.getPostNo());
        m.put("baseAddr", p.getBaseAddr());
        m.put("dtlAddr2", p.getDtlAddr2());
        m.put("telNo", p.getTelNo());
        m.put("faxNo", p.getFaxNo());
        m.put("suboNo", p.getSuboNo());
        m.put("asgnrNm", p.getAsgnrNm());
        m.put("asgnrDeptNm", p.getAsgnrDeptNm());
        m.put("asgnrOdtyNm", p.getAsgnrOdtyNm());
        m.put("asgnrEmail", p.getAsgnrEmail());
        m.put("asgnrHpNo", p.getAsgnrHpNo());
        m.put("asgnrTelNo", p.getAsgnrTelNo());
        return ApiResponse.ok(m);
    }

    @Operation(summary = "ERP 마스터 데이터 수동 동기화")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/sync")
    public ApiResponse<String> syncMasterData() {
        if (erpMasterSyncService.isEmpty()) {
            return ApiResponse.ok("Oracle 연동이 비활성화 상태입니다.");
        }
        erpMasterSyncService.get().syncPartners();
        erpMasterSyncService.get().syncEmployees();
        erpMasterSyncService.get().syncDepartments();
        erpMasterSyncService.get().syncItems();
        erpMasterSyncService.get().syncCommonCodes();
        return ApiResponse.ok("동기화 완료");
    }

    @Operation(summary = "ERP 공통코드(배송방법 등) 수동 동기화")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/sync/common-codes")
    public ApiResponse<String> syncCommonCodes() {
        if (erpMasterSyncService.isEmpty()) {
            return ApiResponse.ok("Oracle 연동이 비활성화 상태입니다.");
        }
        erpMasterSyncService.get().syncCommonCodes();
        return ApiResponse.ok("공통코드 동기화 완료");
    }

    /**
     * 시트 #65 — 임의 일자 가입자 동기화 (incremental).
     * date 미지정 시 어제 기준.
     */
    @Operation(summary = "ERP 일자별 가입자 incremental 동기화 (수동)")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/sync/employees-joined")
    public ApiResponse<String> syncEmployeesJoinedOn(
            @RequestParam(required = false) String date) {
        if (erpMasterSyncService.isEmpty()) {
            return ApiResponse.ok("Oracle 연동이 비활성화 상태입니다.");
        }
        java.time.LocalDate target = (date == null || date.isBlank())
                ? java.time.LocalDate.now().minusDays(1)
                : java.time.LocalDate.parse(date);
        erpMasterSyncService.get().syncEmployeesJoinedOn(target);
        return ApiResponse.ok("일자별 가입자 동기화 완료: " + target);
    }

    @Operation(summary = "Oracle 테이블 컬럼 조회 (진단용)")
    @GetMapping("/oracle-columns")
    public ApiResponse<List<String>> getOracleColumns(@RequestParam String tableName) {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Collections.emptyList());
        }
        return ApiResponse.ok(erpPartnerRepository.get().getTableColumns(tableName.toUpperCase()));
    }

    @Operation(summary = "Oracle 컬럼명 패턴으로 테이블 검색 (진단용)")
    @GetMapping("/oracle-find-tables")
    public ApiResponse<List<Map<String, String>>> findOracleTables(
            @RequestParam(required = false, defaultValue = "") String tablePattern,
            @RequestParam(required = false, defaultValue = "") String columnPattern) {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Collections.emptyList());
        }
        return ApiResponse.ok(erpPartnerRepository.get().findTablesByPattern(tablePattern.toUpperCase(), columnPattern.toUpperCase()));
    }

    @Operation(summary = "부서 목록 조회 (Oracle ERP)")
    @GetMapping("/departments")
    public ApiResponse<List<Map<String, Object>>> getDepartments(
            @RequestParam(required = false) Integer plantCd) {
        // Oracle에서 직접 조회
        if (erpDepartmentRepository.isPresent()) {
            try {
                var erpRepo = erpDepartmentRepository.get();
                var depts = plantCd != null
                        ? erpRepo.findByCompanyCd(String.valueOf(plantCd))
                        : erpRepo.findAll();
                List<Map<String, Object>> result = depts.stream()
                        .filter(d -> d.getDeptNm() != null && !d.getDeptNm().isBlank())
                        .filter(d -> {
                            try { Integer.parseInt(d.getDeptCd()); return true; }
                            catch (NumberFormatException e) { return false; }
                        })
                        .collect(Collectors.toMap(
                            d -> d.getDeptNm().trim(),
                            d -> {
                                Map<String, Object> m = new LinkedHashMap<>();
                                m.put("deptCd", Integer.parseInt(d.getDeptCd()));
                                m.put("deptNm", d.getDeptNm());
                                return m;
                            },
                            (existing, replacement) -> existing,
                            LinkedHashMap::new
                        ))
                        .values().stream()
                        .collect(Collectors.toList());
                if (!result.isEmpty()) {
                    return ApiResponse.ok(result);
                }
            } catch (Exception e) {
                log.warn("Oracle 부서 조회 실패, MySQL fallback: {}", e.getMessage());
            }
        }
        // Oracle 비활성화 시 MySQL fallback
        List<Department> departments;
        if (plantCd != null) {
            departments = departmentRepository.findAllByCompanyCd(plantCd);
        } else {
            // 전체 공장 부서 합산
            departments = java.util.stream.Stream.of(1000, 2000, 3000)
                    .flatMap(cd -> departmentRepository.findAllByCompanyCd(cd).stream())
                    .collect(Collectors.toList());
        }
        List<Map<String, Object>> result = departments.stream()
                .filter(d -> d.getDeptNm() != null && !d.getDeptNm().isBlank())
                .collect(Collectors.toMap(
                    d -> d.getDeptNm().trim(),
                    d -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("deptCd", d.getId().getDeptCd());
                        m.put("deptNm", d.getDeptNm());
                        return m;
                    },
                    (existing, replacement) -> existing,
                    LinkedHashMap::new
                ))
                .values().stream()
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    @Operation(summary = "부서 트리 조회 (deptCd/deptNm/upDeptCd) — 팀/파트 계층용")
    @GetMapping("/dept-tree")
    public ApiResponse<List<Map<String, Object>>> getDeptTree() {
        // MySQL departments 테이블 기준 (up_dept_cd 계층 보유). deptCd 기준 중복 제거.
        List<Map<String, Object>> result = java.util.stream.Stream.of(1000, 2000, 3000)
                .flatMap(cd -> departmentRepository.findAllByCompanyCd(cd).stream())
                .filter(d -> d.getDeptNm() != null && !d.getDeptNm().isBlank())
                .collect(Collectors.toMap(
                    d -> d.getId().getDeptCd(),
                    d -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("deptCd", d.getId().getDeptCd());
                        m.put("deptNm", d.getDeptNm());
                        m.put("upDeptCd", d.getUpDeptCd());
                        return m;
                    },
                    (a, b) -> a,
                    LinkedHashMap::new
                ))
                .values().stream()
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    @Operation(summary = "품목 검색 (Oracle ERP)")
    @GetMapping("/items")
    public ApiResponse<List<Map<String, String>>> searchItems(
            @RequestParam(required = false, defaultValue = "") String keyword) {
        if (erpItemRepository.isEmpty()) {
            return ApiResponse.ok(Collections.emptyList());
        }
        List<ErpItemDto> items = keyword.isBlank()
                ? Collections.emptyList()
                : erpItemRepository.get().searchByKeyword(keyword);
        List<Map<String, String>> result = items.stream()
                .map(i -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("itemCd", i.getItemCd());
                    m.put("itemNm", i.getItemNm());
                    m.put("itemSpec", i.getItemSpecDc());
                    m.put("unit", i.getStdUnitCd());
                    return m;
                })
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    @Operation(summary = "품목 규격 검색 (Oracle ERP)")
    @GetMapping("/item-specs")
    public ApiResponse<List<String>> searchItemSpecs(
            @RequestParam(required = false, defaultValue = "") String keyword) {
        if (erpItemRepository.isEmpty() || keyword.isBlank()) {
            return ApiResponse.ok(Collections.emptyList());
        }
        return ApiResponse.ok(erpItemRepository.get().searchSpecs(keyword));
    }

    @Operation(summary = "세무구분 목록 조회 (Oracle MA_TAX_MST 우선)")
    @GetMapping("/tax-types")
    public ApiResponse<List<Map<String, String>>> getTaxTypes() {
        if (erpCodeRepository.isPresent()) {
            try {
                List<Map<String, String>> result = erpCodeRepository.get().findTaxTypes();
                if (!result.isEmpty()) return ApiResponse.ok(result);
            } catch (Exception ignored) {}
        }
        // Oracle 비활성화 또는 데이터 없을 때 기본 상수 폴백
        List<Map<String, String>> result = new ArrayList<>();
        Map<String, String> taxTypes = new LinkedHashMap<>();
        taxTypes.put("TAXABLE", "과세매출");
        taxTypes.put("ZERO_RATE", "영세매출");
        taxTypes.put("EXEMPT", "면세매출");
        taxTypes.put("INDIVIDUAL", "건별매출");
        taxTypes.put("CARD", "카드매출");
        for (var entry : taxTypes.entrySet()) {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("value", entry.getKey());
            m.put("label", entry.getValue());
            result.add(m);
        }
        return ApiResponse.ok(result);
    }

    @Operation(summary = "작업코드/작업명 목록 조회 (PP_OPTPRI_INFO_X20329 + MA_CODEDTL Z010_20329)")
    @GetMapping("/work-codes")
    public ApiResponse<List<Map<String, String>>> getWorkCodes() {
        if (erpCodeRepository.isEmpty()) return ApiResponse.ok(Collections.emptyList());
        try {
            return ApiResponse.ok(erpCodeRepository.get().findWorkCodes());
        } catch (Exception e) {
            return ApiResponse.ok(Collections.emptyList());
        }
    }

    @Operation(summary = "작업처 목록 조회 (MA_CODEDTL Z021_20329, REL_FLAG_1_CD='O' — 외주만, 주문 상세/등록 폼용)")
    @GetMapping("/work-types")
    public ApiResponse<List<Map<String, String>>> getWorkTypes() {
        if (erpCodeRepository.isEmpty()) return ApiResponse.ok(Collections.emptyList());
        try {
            // 주문 상세/등록 폼: 외주('O')만 (G0600/G0601/G9999) — 사용자가 선택할 작업처는 외주로 한정.
            // 리스트 wrkNm 매핑은 OrderService.enrichWrkNm 에서 모든 작업처(전체 8건) 별도 사용.
            return ApiResponse.ok(erpCodeRepository.get().findWorkTypes(false));
        } catch (Exception e) {
            return ApiResponse.ok(Collections.emptyList());
        }
    }

    @Operation(summary = "품목구분 목록 조회 (MA_ITEM_SA, PRDUCTGRP_CD='99996', FLOW_PATH_CD='2000')")
    @GetMapping("/item-categories")
    public ApiResponse<List<Map<String, String>>> getItemCategories() {
        if (erpCodeRepository.isEmpty()) return ApiResponse.ok(Collections.emptyList());
        try {
            return ApiResponse.ok(erpCodeRepository.get().findItemCategories());
        } catch (Exception e) {
            return ApiResponse.ok(Collections.emptyList());
        }
    }

    @Operation(summary = "구성 목록 조회 (MA_CODEDTL Z019_20329)")
    @GetMapping("/compositions")
    public ApiResponse<List<Map<String, String>>> getCompositions() {
        if (erpCodeRepository.isEmpty()) return ApiResponse.ok(Collections.emptyList());
        try {
            return ApiResponse.ok(erpCodeRepository.get().findCompositions());
        } catch (Exception e) {
            return ApiResponse.ok(Collections.emptyList());
        }
    }

    @Operation(summary = "코드 조회 진단 (MA_CODEDTL FIELD_CD 샘플 확인)")
    @GetMapping("/diagnose-codes")
    public ApiResponse<Map<String, Object>> diagnoseCodes() {
        if (erpCodeRepository.isEmpty()) return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        return ApiResponse.ok(erpCodeRepository.get().diagnoseCodeLookup());
    }

    @Operation(summary = "Oracle WRK_FG 실제 코드 전수 조회 (진단용)")
    @GetMapping("/diagnose-wrkfg")
    public ApiResponse<Map<String, Object>> diagnoseWrkFg() {
        if (erpCodeRepository.isEmpty()) return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        return ApiResponse.ok(erpCodeRepository.get().diagnoseWrkFgCodes());
    }

    @Operation(summary = "사원 검색 (Oracle HR_EMP_MST 우선, MySQL 폴백)")
    @GetMapping("/employees")
    public ApiResponse<List<Map<String, Object>>> searchEmployees(
            @RequestParam(required = false, defaultValue = "") String keyword) {
        // Oracle HR_EMP_MST 우선 조회
        if (erpEmployeeRepository.isPresent()) {
            List<ErpEmployeeDto> employees = erpEmployeeRepository.get().searchByKeyword(keyword);
            List<Map<String, Object>> result = employees.stream()
                    .map(e -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", e.getEmpNo());
                        m.put("employeeNo", e.getEmpNo());
                        m.put("name", e.getKorNm());
                        m.put("departmentName", e.getDeptNm() != null ? e.getDeptNm() : resolveDeptName(e.getDeptCd()));
                        m.put("deptCd", parseDeptCd(e.getDeptCd()));  // 영업담당자 선택 시 영업부서코드 직접 세팅용
                        return m;
                    })
                    .collect(Collectors.toList());
            return ApiResponse.ok(result);
        }
        // MySQL 폴백
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        if (companyCd == null) companyCd = 1000;

        List<User> users = keyword.isBlank()
                ? userRepository.searchByKeyword(companyCd, "")
                : userRepository.searchByKeyword(companyCd, keyword);

        List<Map<String, Object>> result = users.stream()
                .map(u -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", u.getEmployeeNo());
                    m.put("employeeNo", u.getEmployeeNo());
                    m.put("name", u.getName());
                    // 부서명은 코드가 아니라 실제 부서명으로 (이름 매칭용). 코드는 deptCd 로 별도 제공.
                    m.put("departmentName", u.getDeptCd() != null ? resolveDeptName(String.valueOf(u.getDeptCd())) : "");
                    m.put("deptCd", u.getDeptCd());
                    return m;
                })
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    /** 부서코드 → 부서명 변환 (Oracle 우선) */
    private Integer parseDeptCd(String deptCd) {
        if (deptCd == null || deptCd.isBlank()) return null;
        try { return Integer.valueOf(deptCd.trim()); } catch (NumberFormatException ex) { return null; }
    }

    private String resolveDeptName(String deptCd) {
        if (deptCd == null || deptCd.isBlank()) return "";
        if (erpDepartmentRepository.isPresent()) {
            return erpDepartmentRepository.get().findAll().stream()
                    .filter(d -> deptCd.equals(d.getDeptCd()))
                    .map(d -> d.getDeptNm())
                    .findFirst().orElse(deptCd);
        }
        return deptCd;
    }

    @Operation(summary = "Oracle ERP 연결 상태 및 데이터 조회 검증")
    @GetMapping("/health")
    public ApiResponse<Map<String, Object>> checkErpHealth() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("oracleEnabled", erpPartnerRepository.isPresent());
        if (erpPartnerRepository.isPresent()) {
            var repo = erpPartnerRepository.get();
            boolean connected = repo.ping();
            result.put("oracleConnected", connected);
            result.put("message", connected ? "Oracle ERP 연결 정상" : "Oracle ERP 연결 실패");

            if (connected) {
                // 실제 데이터 조회 검증
                long partnerCount = repo.countActive();
                result.put("partnerCount", partnerCount);

                var sample = repo.findFirst();
                if (sample != null) {
                    Map<String, String> sampleData = new LinkedHashMap<>();
                    sampleData.put("partnerCd", sample.getPartnerCd());
                    sampleData.put("partnerNm", sample.getPartnerNm());
                    result.put("samplePartner", sampleData);
                    result.put("dataVerified", true);
                } else {
                    result.put("dataVerified", false);
                    result.put("dataMessage", "CI_PARTNER_MST 데이터 없음");
                }
            }
        } else {
            result.put("oracleConnected", false);
            result.put("message", "Oracle ERP 연동 비활성화 상태");
        }
        result.put("checkedAt", java.time.LocalDateTime.now().toString());
        return ApiResponse.ok(result);
    }

    @Operation(summary = "담당부서 Oracle JOIN 체인 진단 (각 단계별 데이터 확인)")
    @GetMapping("/diagnose-dept")
    public ApiResponse<Map<String, Object>> diagnoseDept() {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        }
        return ApiResponse.ok(erpPartnerRepository.get().diagnoseDeptChain());
    }

    @Operation(summary = "SS_PARTNER_MST 기반 담당부서 진단")
    @GetMapping("/diagnose-ss-partner")
    public ApiResponse<Map<String, Object>> diagnoseSsPartner() {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        }
        return ApiResponse.ok(erpPartnerRepository.get().diagnoseSsPartner());
    }

    @Operation(summary = "MA_PARTNER_PTR RSPT_TP_CD 타입 분석")
    @GetMapping("/diagnose-rspt-type")
    public ApiResponse<Map<String, Object>> diagnoseRsptType() {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        }
        return ApiResponse.ok(erpPartnerRepository.get().diagnoseRsptType());
    }

    @Operation(summary = "MA_PARTNER_PTR 및 VW_MA_PARTNER_MST 담당부서 진단")
    @GetMapping("/diagnose-partner-ptr")
    public ApiResponse<Map<String, Object>> diagnosePartnerPtr() {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        }
        return ApiResponse.ok(erpPartnerRepository.get().diagnosePartnerPtr());
    }

    @Operation(summary = "ASGNR_DEPT_NM vs VW_MA_DEPT_MST 교차 확인")
    @GetMapping("/diagnose-asgnr-dept-match")
    public ApiResponse<Map<String, Object>> diagnoseAsgnrDeptMatch() {
        if (erpPartnerRepository.isEmpty()) {
            return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        }
        return ApiResponse.ok(erpPartnerRepository.get().diagnoseAsgnrDeptMatch());
    }

    @Operation(summary = "searchPaged 직접 테스트 (에러 진단용)")
    @GetMapping("/test-search-paged")
    public ApiResponse<Map<String, Object>> testSearchPaged() {
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        if (erpPartnerRepository.isEmpty()) {
            result.put("error", "Oracle 비활성화 상태");
            return ApiResponse.ok(result);
        }
        try {
            var items = erpPartnerRepository.get().searchPaged(null, null, null, 0, 3, null, null, null);
            result.put("success", true);
            result.put("count", items.size());
            if (!items.isEmpty()) {
                var first = items.get(0);
                result.put("firstPartnerCd", first.getPartnerCd());
                result.put("firstPartnerNm", first.getPartnerNm());
                result.put("firstDeptCd", first.getDeptCd());
                result.put("firstDeptNm", first.getDeptNm());
            }
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
            result.put("cause", e.getCause() != null ? e.getCause().getMessage() : null);
        }
        try {
            long total = erpPartnerRepository.get().countAll(null, null, null, null);
            result.put("totalCount", total);
        } catch (Exception e) {
            result.put("countError", e.getMessage());
        }
        return ApiResponse.ok(result);
    }

    @Operation(summary = "공장(Plant) 목록 조회 (Oracle MA_PLANT_MST 기준)")
    @GetMapping("/plants")
    public ApiResponse<List<Map<String, Object>>> getPlants() {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        if (companyCd == null) companyCd = 1000;

        // Oracle VW_MA_PLANT_MST_C49 조회
        if (erpPlantRepository.isPresent()) {
            List<ErpPlantDto> plants = erpPlantRepository.get().findByCompanyCd(String.valueOf(companyCd));
            if (!plants.isEmpty()) {
                List<Map<String, Object>> result = plants.stream()
                        .map(p -> {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("plantCd", Integer.parseInt(p.getPlantCd()));
                            m.put("plantNm", p.getPlantNm());
                            return m;
                        })
                        .collect(Collectors.toList());
                return ApiResponse.ok(result);
            }
        }

        // Oracle 비활성화 또는 데이터 없을 때 MySQL 기반 fallback
        Integer currentPlant = SecurityContextUtil.getCurrentPlantCd();
        if (currentPlant == null) currentPlant = 1000;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("plantCd", currentPlant);
        m.put("plantNm", "기본공장");
        return ApiResponse.ok(List.of(m));
    }

    @Operation(summary = "ERP 동기화 이력 조회 (최근 50건)")
    @GetMapping("/sync-logs")
    public ApiResponse<List<Map<String, Object>>> getSyncLogs() {
        List<com.tara.crm.integration.erp.entity.ErpSyncLog> logs =
                erpSyncLogRepository.findTop50ByOrderByCreatedAtDesc();
        List<Map<String, Object>> result = logs.stream()
                .map(log -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", log.getId());
                    m.put("syncType", log.getSyncType());
                    m.put("direction", log.getDirection());
                    m.put("status", log.getStatus());
                    m.put("totalCount", log.getTotalCount());
                    m.put("successCount", log.getSuccessCount());
                    m.put("failCount", log.getFailCount());
                    m.put("errorMessage", log.getErrorMessage());
                    m.put("startedAt", log.getStartedAt() != null ? log.getStartedAt().toString() : null);
                    m.put("finishedAt", log.getFinishedAt() != null ? log.getFinishedAt().toString() : null);
                    return m;
                })
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    @Operation(summary = "MA_DEPT_MST UP_DEPT_CD 분포 진단")
    @GetMapping("/diagnose-up-dept-cd")
    public ApiResponse<List<Map<String, Object>>> diagnoseUpDeptCd() {
        if (erpDepartmentRepository.isEmpty()) {
            return ApiResponse.ok(Collections.emptyList());
        }
        try {
            return ApiResponse.ok(erpDepartmentRepository.get().findUpDeptCdSummary());
        } catch (Exception e) {
            log.warn("UP_DEPT_CD 진단 실패: {}", e.getMessage());
            return ApiResponse.ok(Collections.emptyList());
        }
    }

    @Operation(summary = "HR_EMP_MST PLANT_CD 분포 진단")
    @GetMapping("/diagnose-plant-cd")
    public ApiResponse<Map<String, Object>> diagnosePlantCd() {
        if (erpEmployeeRepository.isEmpty()) {
            return ApiResponse.ok(Map.of("error", "Oracle 비활성화 상태"));
        }
        return ApiResponse.ok(erpEmployeeRepository.get().diagnosePlantCd());
    }
}
