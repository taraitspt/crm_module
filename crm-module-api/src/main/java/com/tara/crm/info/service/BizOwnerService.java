package com.tara.crm.info.service;

import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.DuplicateResourceException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.id.DepartmentId;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.dto.BizOwnerDto;
import com.tara.crm.info.entity.BusinessOwner;
import com.tara.crm.info.repository.BizOwnerQueryRepository;
import com.tara.crm.info.repository.BusinessOwnerRepository;
import com.tara.crm.integration.erp.dto.ErpPartnerDto;
import com.tara.crm.integration.erp.repository.ErpPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BizOwnerService {

    private final BusinessOwnerRepository bizOwnerRepository;
    private final BizOwnerQueryRepository bizOwnerQueryRepository;
    private final DepartmentRepository departmentRepository;
    private final Optional<ErpPartnerRepository> erpPartnerRepository;

    /** 사업자 목록 - Oracle에서 직접 조회 (공장코드 필터 지원) */
    public Page<BizOwnerDto.ListItem> list(BizOwnerDto.SearchCondition cond) {
        // Oracle에서 직접 조회
        if (erpPartnerRepository.isPresent()) {
            int offset = cond.getPage() * cond.getSize();
            List<ErpPartnerRepository.PartnerColFilter> colFilters = cond.getColFilters() == null ? null
                    : cond.getColFilters().stream()
                        .map(f -> new ErpPartnerRepository.PartnerColFilter(
                                f.getColId(), f.getOp(), f.getValues(), f.getExcludeBlank()))
                        .toList();
            List<ErpPartnerDto> partners = erpPartnerRepository.get()
                    .searchPaged(cond.getKeyword(), cond.getPlantCd(), cond.getDeptCd(), offset, cond.getSize(),
                            cond.getSortField(), cond.getSortDir(), colFilters);

            // ★ N+1 제거 (2026-09-01) — 기존엔 행마다 toListItem() 안에서
            //     ① MySQL 부서 override 조회(findByCompanyCdAndPartnerCd)
            //     ② override 있으면 Oracle 부서명 조회(findDeptNameByCode)
            //   를 돌렸다. 전량조회(1만행) 시 MySQL 1만회 + Oracle 수백회 왕복 = 이 화면이 느렸던 지배적 원인.
            //   → ① 은 IN 배치 1회, ② 는 distinct 부서코드당 1회(메모)로 축소.
            Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
            int effCompanyCd = companyCd != null ? companyCd : 1000;
            List<String> partnerCds = partners.stream()
                    .map(ErpPartnerDto::getPartnerCd)
                    .filter(s -> s != null && !s.isBlank())
                    .distinct()
                    .collect(Collectors.toList());
            java.util.Map<String, BusinessOwner> overrideMap = partnerCds.isEmpty()
                    ? java.util.Map.of()
                    : bizOwnerRepository.findByCompanyCdAndPartnerCdIn(effCompanyCd, partnerCds).stream()
                        .collect(Collectors.toMap(BusinessOwner::getPartnerCd, bo -> bo, (a, b) -> a));
            java.util.Map<Integer, String> deptNmMemo = new java.util.HashMap<>();

            List<BizOwnerDto.ListItem> content = partners.stream()
                    .map(p -> toListItem(p, effCompanyCd, overrideMap, deptNmMemo))
                    .collect(Collectors.toList());
            long total = erpPartnerRepository.get()
                    .countAll(cond.getKeyword(), cond.getPlantCd(), cond.getDeptCd(), colFilters);
            Pageable pageable = PageRequest.of(cond.getPage(), cond.getSize());
            return new PageImpl<>(content, pageable, total);
        }
        // MySQL fallback
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        if (companyCd == null) companyCd = 1000;
        Pageable pageable = PageRequest.of(cond.getPage(), cond.getSize());
        Page<BizOwnerDto.ListItem> page = bizOwnerQueryRepository.search(cond, pageable, companyCd);
        return page;
    }

    /** 목록 행 매핑 — override/부서명은 미리 만든 배치 맵으로만 채운다(행별 DB 호출 금지). */
    private BizOwnerDto.ListItem toListItem(ErpPartnerDto p, Integer companyCd,
            java.util.Map<String, BusinessOwner> overrideMap, java.util.Map<Integer, String> deptNmMemo) {
        BizOwnerDto.ListItem item = BizOwnerDto.ListItem.builder()
                .partnerCd(p.getPartnerCd())
                .companyName(p.getPartnerNm())
                .bizNo(p.getBizrNo())
                .bizType(p.getBiztpNm())
                .bizItem(p.getBizcNm())
                .address(p.getBaseAddr())
                .ceoNm(p.getCeoNm())
                .createdAt(p.getInsertDts())
                .updatedAt(p.getUpdateDts())
                .build();

        // 1. Oracle에서 직접 가져온 부서코드/부서명 사용
        if (p.getDeptCd() != null) {
            try {
                item.setDeptCd(Integer.parseInt(p.getDeptCd()));
            } catch (NumberFormatException ignored) {}
        }
        if (p.getDeptNm() != null && !p.getDeptNm().isBlank()) {
            item.setDepartmentName(p.getDeptNm());
        }

        // 2. MySQL 수동 설정값이 있으면 override — 배치 조회한 맵에서.
        BusinessOwner bo = overrideMap.get(p.getPartnerCd());
        if (bo != null) {
            if (bo.getCreatedAt() != null) item.setCreatedAt(bo.getCreatedAt());
            if (bo.getUpdatedAt() != null) item.setUpdatedAt(bo.getUpdatedAt());
            if (bo.getDeptCd() != null) {
                item.setDeptCd(bo.getDeptCd());
                // 부서명은 distinct 코드당 1회만 조회(메모). Oracle 우선, 없으면 MySQL 폴백 — 기존 로직과 동일.
                String deptNm = deptNmMemo.computeIfAbsent(bo.getDeptCd(), cd -> {
                    String nm = erpPartnerRepository.isPresent()
                            ? erpPartnerRepository.get().findDeptNameByCode(cd) : null;
                    if (nm == null || nm.isBlank()) {
                        nm = departmentRepository.findById(new DepartmentId(companyCd, cd))
                                .map(d -> d.getDeptNm()).orElse("");
                    }
                    return nm != null ? nm : "";
                });
                if (!deptNm.isBlank()) item.setDepartmentName(deptNm);
            }
        }
        return item;
    }

    /** 사업자 상세 - partnerCd로 Oracle에서 직접 조회 */
    public BizOwnerDto.Detail getDetail(String id) {
        // Oracle에서 partnerCd로 직접 조회
        if (erpPartnerRepository.isPresent()) {
            var p = erpPartnerRepository.get().findByPartnerCd(id);
            if (p != null) {
                BizOwnerDto.Detail.DetailBuilder detailBuilder = BizOwnerDto.Detail.builder()
                        .partnerCd(p.getPartnerCd())
                        .companyName(p.getPartnerNm())
                        .bizNo(p.getBizrNo())
                        .bizType(p.getBiztpNm())
                        .bizItem(p.getBizcNm())
                        .address(p.getBaseAddr() != null ? p.getBaseAddr() + (p.getDtlAddr2() != null ? " " + p.getDtlAddr2() : "") : null)
                        .representativeName(p.getCeoNm())
                        .representativePhone(p.getTelNo());
                Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
                if (companyCd == null) companyCd = 1000;
                final Integer finalCompanyCd = companyCd;

                // 1. Oracle에서 직접 가져온 부서코드/부서명 사용
                if (p.getDeptCd() != null) {
                    try {
                        detailBuilder.deptCd(Integer.parseInt(p.getDeptCd()));
                    } catch (NumberFormatException ignored) {}
                }
                if (p.getDeptNm() != null && !p.getDeptNm().isBlank()) {
                    detailBuilder.departmentName(p.getDeptNm());
                }

                // 2. MySQL 수동 설정값이 있으면 override
                bizOwnerRepository.findByCompanyCdAndPartnerCd(finalCompanyCd, p.getPartnerCd()).ifPresent(bo -> {
                    if (bo.getDeptCd() != null) {
                        detailBuilder.deptCd(bo.getDeptCd());
                        String deptNm = erpPartnerRepository.isPresent()
                                ? erpPartnerRepository.get().findDeptNameByCode(bo.getDeptCd())
                                : null;
                        if (deptNm != null && !deptNm.isBlank()) {
                            detailBuilder.departmentName(deptNm);
                        } else {
                            departmentRepository.findById(new DepartmentId(finalCompanyCd, bo.getDeptCd()))
                                    .ifPresent(dept -> detailBuilder.departmentName(dept.getDeptNm()));
                        }
                    }
                });
                return detailBuilder.build();
            }
        }
        // MySQL fallback (Long id로 조회)
        try {
            Long numericId = Long.parseLong(id);
            BusinessOwner entity = findByIdOrThrow(numericId);
            return toDetail(entity);
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.BIZ_OWNER_NOT_FOUND, "사업자를 찾을 수 없습니다. id=" + id);
        }
    }

    /** 사업자 등록 */
    @Transactional
    public BizOwnerDto.Detail create(BizOwnerDto.CreateRequest request) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        if (companyCd == null) companyCd = 1000;

        if (StringUtils.hasText(request.getBizNo())
                && bizOwnerRepository.existsByCompanyCdAndBizNo(companyCd, request.getBizNo())) {
            throw new DuplicateResourceException("사업자", "사업자번호", request.getBizNo());
        }

        BusinessOwner entity = BusinessOwner.builder()
            .companyCd(companyCd)
            .partnerCd(request.getPartnerCd())
            .companyName(request.getCompanyName())
            .bizNo(request.getBizNo())
            .bizType(request.getBizType())
            .bizItem(request.getBizItem())
            .address(request.getAddress())
            .representativeName(request.getRepresentativeName())
            .representativeEmail(request.getRepresentativeEmail())
            .representativePhone(request.getRepresentativePhone())
            .deptCd(request.getDeptCd())
            .build();

        bizOwnerRepository.save(entity);

        return toDetail(entity);
    }

    /** 사업자 수정 */
    @Transactional
    public BizOwnerDto.Detail update(String id, BizOwnerDto.UpdateRequest request) {
        BusinessOwner entity = findEntityByIdOrPartnerCd(id);

        if (StringUtils.hasText(request.getBizNo())
                && !request.getBizNo().equals(entity.getBizNo())
                && bizOwnerRepository.existsByCompanyCdAndBizNo(entity.getCompanyCd(), request.getBizNo())) {
            throw new DuplicateResourceException("사업자", "사업자번호", request.getBizNo());
        }

        if (request.getPartnerCd() != null) entity.setPartnerCd(request.getPartnerCd());
        if (request.getCompanyName() != null) entity.setCompanyName(request.getCompanyName());
        if (request.getBizNo() != null) entity.setBizNo(request.getBizNo());
        if (request.getBizType() != null) entity.setBizType(request.getBizType());
        if (request.getBizItem() != null) entity.setBizItem(request.getBizItem());
        if (request.getAddress() != null) entity.setAddress(request.getAddress());
        if (request.getRepresentativeName() != null) entity.setRepresentativeName(request.getRepresentativeName());
        if (request.getRepresentativeEmail() != null) entity.setRepresentativeEmail(request.getRepresentativeEmail());
        if (request.getRepresentativePhone() != null) entity.setRepresentativePhone(request.getRepresentativePhone());
        entity.setDeptCd(request.getDeptCd()); // always apply (null clears)

        return toDetail(entity);
    }

    /** 삭제 */
    @Transactional
    public void delete(String id) {
        BusinessOwner entity = findEntityByIdOrPartnerCd(id);
        bizOwnerRepository.delete(entity);
    }

    /** MySQL id 또는 partnerCd로 엔티티 찾기 (ERP 거래처는 MySQL 레코드 자동 생성) */
    private BusinessOwner findEntityByIdOrPartnerCd(String id) {
        // 숫자면 MySQL auto-increment id로 조회
        try {
            Long numericId = Long.parseLong(id);
            Optional<BusinessOwner> byId = bizOwnerRepository.findById(numericId);
            if (byId.isPresent()) return byId.get();
        } catch (NumberFormatException ignored) {}

        // partnerCd로 MySQL 조회
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        if (companyCd == null) companyCd = 1000;
        final Integer finalCompanyCd = companyCd;

        Optional<BusinessOwner> existing = bizOwnerRepository.findByCompanyCdAndPartnerCd(finalCompanyCd, id);
        if (existing.isPresent()) return existing.get();

        // ERP 거래처: MySQL 레코드가 없으면 담당부서 등 SM전용 필드 저장을 위해 자동 생성
        if (erpPartnerRepository.isPresent()) {
            var p = erpPartnerRepository.get().findByPartnerCd(id);
            if (p != null) {
                BusinessOwner newEntity = BusinessOwner.builder()
                        .companyCd(finalCompanyCd)
                        .partnerCd(p.getPartnerCd())
                        .companyName(p.getPartnerNm() != null ? p.getPartnerNm() : id)
                        .bizNo(p.getBizrNo())
                        .build();
                return bizOwnerRepository.save(newEntity);
            }
        }

        throw new BusinessException(ErrorCode.BIZ_OWNER_NOT_FOUND,
                "사업자를 찾을 수 없습니다. id=" + id);
    }

    private BusinessOwner findByIdOrThrow(Long id) {
        return bizOwnerRepository.findById(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.BIZ_OWNER_NOT_FOUND,
                "사업자를 찾을 수 없습니다. id=" + id));
    }

    private BizOwnerDto.Detail toDetail(BusinessOwner e) {
        String deptName = null;
        if (e.getDeptCd() != null) {
            int companyCd = e.getCompanyCd() != null ? e.getCompanyCd() : 1000;
            deptName = departmentRepository.findById(new DepartmentId(companyCd, e.getDeptCd()))
                    .map(d -> d.getDeptNm()).orElse(null);
        }
        return BizOwnerDto.Detail.builder()
            .id(e.getId())
            .companyCd(e.getCompanyCd())
            .partnerCd(e.getPartnerCd())
            .companyName(e.getCompanyName())
            .bizNo(e.getBizNo())
            .bizType(e.getBizType())
            .bizItem(e.getBizItem())
            .address(e.getAddress())
            .representativeName(e.getRepresentativeName())
            .representativeEmail(e.getRepresentativeEmail())
            .representativePhone(e.getRepresentativePhone())
            .deptCd(e.getDeptCd())
            .departmentName(deptName)
            .createdAt(e.getCreatedAt())
            .build();
    }
}
