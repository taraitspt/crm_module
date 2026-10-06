package com.tara.crm.integration.erp.service;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.info.entity.BusinessOwner;
import com.tara.crm.info.repository.BusinessOwnerRepository;
import com.tara.crm.integration.erp.dto.ErpDepartmentDto;
import com.tara.crm.integration.erp.dto.ErpEmployeeDto;
import com.tara.crm.integration.erp.dto.ErpItemDto;
import com.tara.crm.integration.erp.dto.ErpPartnerDto;
import com.tara.crm.common.code.CommonCode;
import com.tara.crm.common.code.CommonCodeRepository;
import com.tara.crm.common.id.CommonCodeId;
import com.tara.crm.integration.erp.entity.ErpItem;
import com.tara.crm.integration.erp.entity.ErpSyncLog;
import com.tara.crm.integration.erp.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Service
@RequiredArgsConstructor
@Slf4j
public class ErpMasterSyncService {

    private final ErpPartnerRepository erpPartnerRepository;
    private final ErpEmployeeRepository erpEmployeeRepository;
    private final ErpDepartmentRepository erpDepartmentRepository;
    private final ErpItemRepository erpItemRepository;

    private final BusinessOwnerRepository businessOwnerRepository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final ErpItemJpaRepository erpItemJpaRepository;
    private final ErpSyncLogRepository erpSyncLogRepository;
    private final ErpCodeRepository erpCodeRepository;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    private final CommonCodeRepository commonCodeRepository;

    private static final int DEFAULT_COMPANY_CD = 1000;

    /** 킬스위치 — env ERP_COMMON_CODE_SYNC_ENABLED=false 로 공통코드 배치만 끌 수 있음(기본 on). */
    @Value("${erp.common-code-sync.enabled:true}")
    private boolean commonCodeSyncEnabled;

    /**
     * ERP MA_CODEDTL FIELD_CD → CRM common_code group_cd 동기화 대상.
     * key=CRM group_cd, value=ERP FIELD_CD. 그룹 추가는 여기 한 줄이면 됨.
     */
    private static final Map<String, String> COMMON_CODE_GROUP_SOURCES = new LinkedHashMap<>() {{
        put("DELIVERY_METHOD", "Z012_20329");   // 배송방법(공통코드관리) ← ERP MA_CODEDTL
    }};

    @Transactional
    public void syncPartners() {
        ErpSyncLog syncLog = ErpSyncLog.start("PARTNER", "READ");
        erpSyncLogRepository.save(syncLog);

        try {
            // 시트 5/13 — 풀조회로 변경. CI_PARTNER_MST + MA_PARTNER_MST + MA_PARTNER_PTR 통해
            // 우편번호/상세주소/종사업장번호/담당자내선/담당자부서명 까지 SM 측 보관.
            List<ErpPartnerDto> erpPartners = erpPartnerRepository.findAllActiveFull();
            int success = 0, fail = 0;

            for (ErpPartnerDto erp : erpPartners) {
                try {
                    BusinessOwner bo = businessOwnerRepository
                            .findFirstByCompanyCdAndPartnerCd(DEFAULT_COMPANY_CD, erp.getPartnerCd())
                            .orElse(null);

                    if (bo == null) {
                        bo = BusinessOwner.builder()
                                .companyCd(DEFAULT_COMPANY_CD)
                                .partnerCd(erp.getPartnerCd())
                                .companyName(erp.getPartnerNm())
                                .bizNo(erp.getBizrNo())
                                .bizType(erp.getBiztpNm())
                                .bizItem(erp.getBizcNm())
                                .representativeName(erp.getCeoNm())
                                .address(buildAddress(erp.getBaseAddr(), erp.getDtlAddr2()))
                                .postNo(erp.getPostNo())
                                .dtlAddr2(erp.getDtlAddr2())
                                .suboNo(erp.getSuboNo())
                                .asgnrTelNo(erp.getAsgnrTelNo())
                                .asgnrDeptNm(erp.getAsgnrDeptNm())
                                .representativeEmail(erp.getAsgnrEmail())
                                .representativePhone(erp.getAsgnrHpNo())
                                .build();
                    } else {
                        bo.setCompanyName(erp.getPartnerNm());
                        bo.setBizNo(erp.getBizrNo());
                        bo.setBizType(erp.getBiztpNm());
                        bo.setBizItem(erp.getBizcNm());
                        bo.setRepresentativeName(erp.getCeoNm());
                        bo.setAddress(buildAddress(erp.getBaseAddr(), erp.getDtlAddr2()));
                        bo.setPostNo(erp.getPostNo());
                        bo.setDtlAddr2(erp.getDtlAddr2());
                        bo.setSuboNo(erp.getSuboNo());
                        bo.setAsgnrTelNo(erp.getAsgnrTelNo());
                        bo.setAsgnrDeptNm(erp.getAsgnrDeptNm());
                        if (erp.getAsgnrEmail() != null) bo.setRepresentativeEmail(erp.getAsgnrEmail());
                        if (erp.getAsgnrHpNo() != null) bo.setRepresentativePhone(erp.getAsgnrHpNo());
                    }
                    businessOwnerRepository.save(bo);
                    success++;
                } catch (Exception e) {
                    log.warn("거래처 동기화 실패: partnerCd={}", erp.getPartnerCd(), e);
                    fail++;
                }
            }

            syncLog.success(erpPartners.size(), success, fail);
            log.info("거래처 동기화 완료: total={}, success={}, fail={}", erpPartners.size(), success, fail);
        } catch (Exception e) {
            syncLog.fail(e.getMessage());
            log.error("거래처 동기화 전체 실패", e);
        }
        erpSyncLogRepository.save(syncLog);
    }

    @Transactional
    public void syncEmployees() {
        ErpSyncLog syncLog = ErpSyncLog.start("EMPLOYEE", "READ");
        erpSyncLogRepository.save(syncLog);

        try {
            // 시트 #65 — cc_cd 포함 쿼리로 변경. 기존 findAllActive() 는 cc_cd 없음 → 신규 인서트만 가능했음.
            List<ErpEmployeeDto> erpEmployees = erpEmployeeRepository.findAllActiveWithCcCd();
            int success = 0, fail = 0;

            for (ErpEmployeeDto erp : erpEmployees) {
                try {
                    upsertUser(erp);
                    success++;
                } catch (Exception e) {
                    log.warn("사원 동기화 실패: empNo={}", erp.getEmpNo(), e);
                    fail++;
                }
            }

            syncLog.success(erpEmployees.size(), success, fail);
            log.info("사원 동기화 완료: total={}, success={}, fail={}", erpEmployees.size(), success, fail);
        } catch (Exception e) {
            syncLog.fail(e.getMessage());
            log.error("사원 동기화 전체 실패", e);
        }
        erpSyncLogRepository.save(syncLog);
    }

    /**
     * 시트 #65 — 일자별 가입자 동기화 (매일 01:00 배치).
     * 어제(또는 임의 일자) IPSA_DT 인 사원만 조회·insert.
     */
    @Transactional
    public void syncEmployeesJoinedOn(java.time.LocalDate date) {
        ErpSyncLog syncLog = ErpSyncLog.start("EMPLOYEE_JOINED_" + date, "READ");
        erpSyncLogRepository.save(syncLog);
        try {
            List<ErpEmployeeDto> joined = erpEmployeeRepository.findJoinedOn(date);
            int success = 0, fail = 0;
            for (ErpEmployeeDto erp : joined) {
                try { upsertUser(erp); success++; }
                catch (Exception e) {
                    log.warn("일자별 사원 동기화 실패: empNo={}, date={}", erp.getEmpNo(), date, e);
                    fail++;
                }
            }
            syncLog.success(joined.size(), success, fail);
            log.info("일자별 사원 동기화 완료: date={}, total={}, success={}, fail={}",
                date, joined.size(), success, fail);
        } catch (Exception e) {
            syncLog.fail(e.getMessage());
            log.error("일자별 사원 동기화 실패: date={}", date, e);
        }
        erpSyncLogRepository.save(syncLog);
    }

    /**
     * Insert 만 하던 기존 로직 → upsert 로 교체.
     * 신규: 전체 필드 + cc_cd, 가입일.
     * 기존: 비밀번호·role·status 는 그대로 두고 cc_cd, deptCd, name, email, phone 만 갱신.
     * job_title 은 **비어 있을 때만** ERP 직책 코드(ODTY_CD)로 채운다(ErpJobTitle) — 관리자가 사용자 관리에서 넣은
     * 직책이 우선이라서. 뜻이 확인되지 않은 코드면 그대로 둔다. 역할은 직책을 따라 바꾸지 않는다(HRM 이식 2026-10-06).
     */
    private void upsertUser(ErpEmployeeDto erp) {
        // CI_USER_MST.USER_ID 없으면 EMP_NO 로 폴백
        String userKey = (erp.getUserId() != null && !erp.getUserId().isBlank())
                ? erp.getUserId() : erp.getEmpNo();

        var existing = userRepository.findByCompanyCdAndEmployeeNo(DEFAULT_COMPANY_CD, erp.getEmpNo());
        if (existing.isPresent()) {
            User u = existing.get();
            if (erp.getCcCd() != null && !erp.getCcCd().isBlank()) {
                u.setCcCd(erp.getCcCd());
            }
            try { if (erp.getDeptCd() != null) u.setDeptCd(Integer.parseInt(erp.getDeptCd())); } catch (NumberFormatException ignore) {}
            if (erp.getKorNm() != null && !erp.getKorNm().isBlank()) u.setName(erp.getKorNm());
            if (erp.getEmail() != null && !erp.getEmail().isBlank()) u.setEmail(erp.getEmail());
            if (erp.getPhone() != null && !erp.getPhone().isBlank()) u.setPhone(erp.getPhone());
            if (u.getJobTitle() == null || u.getJobTitle().isBlank()) {
                String title = com.tara.crm.integration.erp.ErpJobTitle.of(erp.getOdtyCd());
                if (title != null) u.setJobTitle(title);
            }
        } else {
            User newUser = User.builder()
                    .id(new com.tara.crm.common.id.UserId(DEFAULT_COMPANY_CD, userKey))
                    .employeeNo(erp.getEmpNo())
                    .name(erp.getKorNm() != null ? erp.getKorNm() : erp.getEmpNo())
                    .password(passwordEncoder.encode(randomSecret()))   // 아무도 모르는 값 — 첫 로그인은 Teams 1회용 비밀번호로만(C1)
                    .initialLoginPending(true)
                    .mustChangePassword(true)
                    .role(com.tara.crm.auth.entity.Role.MANAGER)
                    .deptCd(erp.getDeptCd() != null ? safeParseInt(erp.getDeptCd()) : null)
                    .ccCd(erp.getCcCd())
                    .email(erp.getEmail())
                    .phone(erp.getPhone())
                    .jobTitle(com.tara.crm.integration.erp.ErpJobTitle.of(erp.getOdtyCd()))
                    .build();
            userRepository.save(newUser);
        }
    }

    private static final java.security.SecureRandom SECRET_RNG = new java.security.SecureRandom();

    /** 새 계정의 자리표시 비밀번호 — 어디에도 알려주지 않는 256비트 무작위. 로그인은 initial_login_pending 이 막는다. */
    private static String randomSecret() {
        byte[] b = new byte[32];
        SECRET_RNG.nextBytes(b);
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private static Integer safeParseInt(String s) {
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
    }

    @Transactional
    public void syncDepartments() {
        ErpSyncLog syncLog = ErpSyncLog.start("DEPARTMENT", "READ");
        erpSyncLogRepository.save(syncLog);

        try {
            List<ErpDepartmentDto> erpDepts = erpDepartmentRepository.findAll();
            int success = 0, fail = 0;

            for (ErpDepartmentDto erp : erpDepts) {
                try {
                    int deptCdInt;
                    try { deptCdInt = Integer.parseInt(erp.getDeptCd()); }
                    catch (NumberFormatException e) { continue; }

                    var deptId = new com.tara.crm.common.id.DepartmentId(DEFAULT_COMPANY_CD, deptCdInt);
                    // 상위 부서(UP_DEPT_CD) — 조직도의 뿌리. ERP 에 값이 있을 때만 덮어쓴다.
                    // ERP 가 비어 있으면 관리자가 부서 관리에서 넣은 값을 지키려고 건드리지 않는다(HRM 이식 2026-10-06).
                    Integer upDeptCd = safeParseInt(erp.getUpDeptCd());
                    Department dept = departmentRepository.findById(deptId).orElse(null);
                    if (dept != null) {
                        if (erp.getDeptNm() != null) dept.setDeptNm(erp.getDeptNm());
                        dept.setErpDeptCode(erp.getDeptCd());
                        if (upDeptCd != null) dept.setUpDeptCd(upDeptCd);
                    } else {
                        dept = Department.builder()
                                .id(deptId)
                                .deptNm(erp.getDeptNm() != null ? erp.getDeptNm() : erp.getDeptCd())
                                .erpDeptCode(erp.getDeptCd())
                                .upDeptCd(upDeptCd)
                                .build();
                        departmentRepository.save(dept);
                    }
                    success++;
                } catch (Exception e) {
                    log.warn("부서 동기화 실패: deptCd={}", erp.getDeptCd(), e);
                    fail++;
                }
            }

            syncLog.success(erpDepts.size(), success, fail);
            log.info("부서 동기화 완료: total={}, success={}, fail={}", erpDepts.size(), success, fail);
        } catch (Exception e) {
            syncLog.fail(e.getMessage());
            log.error("부서 동기화 전체 실패", e);
        }
        erpSyncLogRepository.save(syncLog);
    }

    @Transactional
    public void syncItems() {
        ErpSyncLog syncLog = ErpSyncLog.start("ITEM", "READ");
        erpSyncLogRepository.save(syncLog);

        try {
            List<ErpItemDto> erpItems = erpItemRepository.findAllActive();
            int success = 0, fail = 0;
            LocalDateTime now = LocalDateTime.now();

            for (ErpItemDto erp : erpItems) {
                try {
                    ErpItem item = erpItemJpaRepository.findByItemCode(erp.getItemCd())
                            .orElse(null);

                    if (item == null) {
                        item = ErpItem.builder()
                                .itemCode(erp.getItemCd())
                                .itemName(erp.getItemNm())
                                .itemSpec(erp.getItemSpecDc())
                                .unit(erp.getStdUnitCd())
                                .useYn("Y")
                                .syncedAt(now)
                                .build();
                    } else {
                        item.setItemName(erp.getItemNm());
                        item.setItemSpec(erp.getItemSpecDc());
                        item.setUnit(erp.getStdUnitCd());
                        item.setSyncedAt(now);
                    }
                    erpItemJpaRepository.save(item);
                    success++;
                } catch (Exception e) {
                    log.warn("품목 동기화 실패: itemCd={}", erp.getItemCd(), e);
                    fail++;
                }
            }

            syncLog.success(erpItems.size(), success, fail);
            log.info("품목 동기화 완료: total={}, success={}, fail={}", erpItems.size(), success, fail);
        } catch (Exception e) {
            syncLog.fail(e.getMessage());
            log.error("품목 동기화 전체 실패", e);
        }
        erpSyncLogRepository.save(syncLog);
    }

    /**
     * ERP 공통코드(MA_CODEDTL) → CRM common_code 동기화. 매일 02:00 배치 + 수동트리거.
     * - code=SYSDEF_CD / label=SYSDEF_NM / sortOrder=DISP_SQ.
     * - 변경분만 write(label·sort 동일하면 skip) — 불필요한 갱신 방지("최신시간 비교" 취지와 동일 효과).
     * - use_yn(관리화면에서 수동으로 숨긴 코드) / wrk_div 는 보존, 신규만 use_yn='Y'.
     * - ERP에서 빠진 코드는 삭제하지 않음(기존 sync 관례대로 잔존).
     * 데이터 소량(그룹당 수십 건)이라 마스터동기화 패턴대로 메서드 단위 트랜잭션 사용(주문/발주 sync의 락 함정과 무관).
     */
    @Transactional
    public void syncCommonCodes() {
        if (!commonCodeSyncEnabled) {
            log.info("공통코드 동기화 비활성화(ERP_COMMON_CODE_SYNC_ENABLED=false) — skip");
            return;
        }
        ErpSyncLog syncLog = ErpSyncLog.start("COMMON_CODE", "READ");
        erpSyncLogRepository.save(syncLog);

        int total = 0, success = 0, fail = 0;
        try {
            for (Map.Entry<String, String> src : COMMON_CODE_GROUP_SOURCES.entrySet()) {
                String groupCd = src.getKey();
                String fieldCd = src.getValue();
                List<Map<String, Object>> rows = erpCodeRepository.findCodeGroup(fieldCd);

                for (Map<String, Object> row : rows) {
                    total++;
                    try {
                        String code = strOrNull(row.get("SYSDEF_CD"));
                        if (code == null || code.isBlank()) { fail++; continue; }
                        String label = strOrNull(row.get("SYSDEF_NM"));
                        if (label == null || label.isBlank()) label = code;
                        int sort = row.get("DISP_SQ") != null ? ((Number) row.get("DISP_SQ")).intValue() : 0;

                        CommonCodeId id = new CommonCodeId(DEFAULT_COMPANY_CD, groupCd, code.trim());
                        CommonCode existing = commonCodeRepository.findById(id).orElse(null);
                        if (existing == null) {
                            commonCodeRepository.save(CommonCode.builder()
                                    .id(id).label(label).sortOrder(sort).useYn("Y").build());
                        } else if (!label.equals(existing.getLabel())
                                || !Integer.valueOf(sort).equals(existing.getSortOrder())) {
                            // 변경분만 갱신 — use_yn/wrk_div 는 그대로 보존.
                            existing.setLabel(label);
                            existing.setSortOrder(sort);
                            commonCodeRepository.save(existing);
                        }
                        success++;
                    } catch (Exception e) {
                        log.warn("공통코드 동기화 실패: group={}, field={}, row={}", groupCd, fieldCd, row, e);
                        fail++;
                    }
                }
            }
            syncLog.success(total, success, fail);
            log.info("공통코드 동기화 완료: total={}, success={}, fail={}", total, success, fail);
        } catch (Exception e) {
            syncLog.fail(e.getMessage());
            log.error("공통코드 동기화 전체 실패", e);
        }
        erpSyncLogRepository.save(syncLog);
    }

    private static String strOrNull(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private String buildAddress(String base, String detail) {
        if (base == null) return detail;
        if (detail == null) return base;
        return base + " " + detail;
    }
}
