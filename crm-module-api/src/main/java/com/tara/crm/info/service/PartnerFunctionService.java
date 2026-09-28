package com.tara.crm.info.service;

import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.info.dto.PartnerFunctionDto;
import com.tara.crm.integration.erp.dto.ErpPartnerFunctionDto;
import com.tara.crm.integration.erp.repository.ErpPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerFunctionService {

    private final Optional<ErpPartnerRepository> erpPartnerRepository;

    public Page<PartnerFunctionDto.ListItem> list(PartnerFunctionDto.SearchCondition cond) {
        if (erpPartnerRepository.isEmpty()) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "ERP 연동이 비활성화되어 있습니다.");
        }

        Pageable pageable = PageRequest.of(cond.getPage(), cond.getSize());
        int offset = cond.getPage() * cond.getSize();
        java.util.List<ErpPartnerRepository.PartnerColFilter> colFilters = cond.getColFilters() == null ? null
                : cond.getColFilters().stream()
                    .map(f -> new ErpPartnerRepository.PartnerColFilter(
                            f.getColId(), f.getOp(), f.getValues(), f.getExcludeBlank()))
                    .toList();
        var content = erpPartnerRepository.get()
                .searchPartnerFunctions(cond.getKeyword(), cond.getPartnerCd(), cond.getEmployeeNo(),
                        offset, cond.getSize(), cond.getSortField(), cond.getSortDir(), colFilters)
                .stream()
                .map(this::toListItem)
                .toList();
        long total = erpPartnerRepository.get()
                .countPartnerFunctions(cond.getKeyword(), cond.getPartnerCd(), cond.getEmployeeNo(), colFilters);
        return new PageImpl<>(content, pageable, total);
    }

    private PartnerFunctionDto.ListItem toListItem(ErpPartnerFunctionDto p) {
        return PartnerFunctionDto.ListItem.builder()
                .companyCd(p.getCompanyCd())
                .partnerCd(p.getPartnerCd())
                .partnerNm(p.getPartnerNm())
                .salesorgnCd(p.getSalesorgnCd())
                .dischCd(p.getDischCd())
                .prductgrpCd(p.getPrductgrpCd())
                .prtnrFnCd(p.getPrtnrFnCd())
                .prtnrCd(p.getPrtnrCd())
                .partnerBpName(p.getPartnerBpName())
                .partnerBpDeptCd(p.getPartnerBpDeptCd())
                .partnerBpDeptName(p.getPartnerBpDeptName())
                .defaultYn(p.getDefaultYn() != null ? p.getDefaultYn() : "N")
                .build();
    }
}
