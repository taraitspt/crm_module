package com.tara.crm.info.service;

import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.dto.PartnerContactDto;
import com.tara.crm.info.entity.PartnerContact;
import com.tara.crm.info.repository.PartnerContactRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

/** 고객 담당자 연락처 CRUD. 대표 담당자는 거래처당 한 명만 유지한다. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerContactService {

    private final PartnerContactRepository repository;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public List<PartnerContactDto.Item> list(String partnerCd) {
        if (partnerCd == null || partnerCd.isBlank()) return List.of();
        return repository.findByPartner(companyCd(), partnerCd.trim()).stream()
                .map(PartnerContactService::toItem)
                .toList();
    }

    @Transactional
    public Long create(PartnerContactDto.SaveRequest req) {
        PartnerContact c = new PartnerContact();
        c.setCompanyCd(companyCd());
        c.setPartnerCd(req.getPartnerCd().trim());
        apply(c, req);
        PartnerContact saved = repository.save(c);
        if (Boolean.TRUE.equals(req.getIsPrimary())) {
            repository.clearPrimary(companyCd(), saved.getPartnerCd(), saved.getContactId());
        }
        return saved.getContactId();
    }

    @Transactional
    public void update(Long id, PartnerContactDto.SaveRequest req) {
        PartnerContact c = load(id);
        apply(c, req);
        repository.save(c);
        if (Boolean.TRUE.equals(req.getIsPrimary())) {
            repository.clearPrimary(companyCd(), c.getPartnerCd(), c.getContactId());
        }
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(load(id));
    }

    private PartnerContact load(Long id) {
        PartnerContact c = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!Objects.equals(c.getCompanyCd(), companyCd())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        return c;
    }

    private void apply(PartnerContact c, PartnerContactDto.SaveRequest req) {
        c.setName(req.getName().trim());
        c.setPositionNm(blankToNull(req.getPositionNm()));
        c.setDeptNm(blankToNull(req.getDeptNm()));
        c.setPhone(blankToNull(req.getPhone()));
        c.setTel(blankToNull(req.getTel()));
        c.setEmail(blankToNull(req.getEmail()));
        c.setIsPrimary(Boolean.TRUE.equals(req.getIsPrimary()));
        c.setMemo(blankToNull(req.getMemo()));
    }

    private static PartnerContactDto.Item toItem(PartnerContact c) {
        return PartnerContactDto.Item.builder()
                .contactId(c.getContactId())
                .partnerCd(c.getPartnerCd())
                .name(c.getName())
                .positionNm(c.getPositionNm())
                .deptNm(c.getDeptNm())
                .phone(c.getPhone())
                .tel(c.getTel())
                .email(c.getEmail())
                .isPrimary(Boolean.TRUE.equals(c.getIsPrimary()))
                .memo(c.getMemo())
                .build();
    }
}
