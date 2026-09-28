package com.tara.crm.info.service;

import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.dto.CustomerDto;
import com.tara.crm.integration.erp.dto.ErpPartnerDto;
import com.tara.crm.integration.erp.repository.ErpPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CustomerService {

    private final Optional<ErpPartnerRepository> erpPartnerRepository;

    public Page<CustomerDto.ListItem> list(CustomerDto.SearchCondition cond) {
        if (erpPartnerRepository.isEmpty()) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "ERP 연동이 비활성화되어 있습니다.");
        }

        Pageable pageable = PageRequest.of(cond.getPage(), cond.getSize());

        // partnerCd 직접 조회: MA_PARTNERSA_INFO 우회, CI_PARTNER_MST+MA_PARTNER_PTR 직접 검색
        if (cond.getPartnerCd() != null && !cond.getPartnerCd().isBlank()) {
            List<CustomerDto.ListItem> content = erpPartnerRepository.get()
                    .findContactsByPartnerCd(cond.getPartnerCd())
                    .stream()
                    .filter(p -> {
                        String kw = cond.getKeyword();
                        if (kw == null || kw.isBlank()) return true;
                        String name = p.getAsgnrNm();
                        return name != null && name.contains(kw);
                    })
                    .map(this::toListItem)
                    .collect(java.util.stream.Collectors.toList());
            return new PageImpl<>(content, pageable, content.size());
        }

        String keyword = cond.getKeyword();
        int offset = cond.getPage() * cond.getSize();
        List<ErpPartnerRepository.PartnerColFilter> colFilters = cond.getColFilters() == null ? null
                : cond.getColFilters().stream()
                    .map(f -> new ErpPartnerRepository.PartnerColFilter(
                            f.getColId(), f.getOp(), f.getValues(), f.getExcludeBlank()))
                    .toList();
        List<CustomerDto.ListItem> content = erpPartnerRepository.get()
                .searchSalesCustomersPaged(keyword, offset, cond.getSize(),
                        cond.getSortField(), cond.getSortDir(), colFilters)
                .stream()
                .map(this::toListItem)
                .collect(java.util.stream.Collectors.toList());
        long total = erpPartnerRepository.get().countSalesCustomers(keyword, colFilters);
        return new PageImpl<>(content, pageable, total);
    }

    public CustomerDto.Detail getDetailByPartnerCd(String partnerCd) {
        if (erpPartnerRepository.isEmpty()) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "ERP 연동이 비활성화되어 있습니다.");
        }
        ErpPartnerDto p = erpPartnerRepository.get().findByPartnerCd(partnerCd);
        if (p == null) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "고객을 찾을 수 없습니다. partnerCd=" + partnerCd);
        }
        return toDetail(p);
    }

    private static String blankToNull(String s) {
        return (s != null && !s.isBlank()) ? s.trim() : null;
    }

    private CustomerDto.ListItem toListItem(ErpPartnerDto p) {
        String hpNo = blankToNull(p.getAsgnrHpNo());
        String telNo = blankToNull(p.getAsgnrTelNo());
        String phone = hpNo != null ? hpNo : telNo;
        return CustomerDto.ListItem.builder()
                .partnerCd(p.getPartnerCd())
                .companyName(p.getPartnerNm())
                .contactName(p.getAsgnrNm())
                .contactDept(p.getAsgnrDeptNm())
                .contactPosition(p.getAsgnrOdtyNm())
                .contactEmail(blankToNull(p.getAsgnrEmail()))
                .contactPhone(phone)
                .build();
    }

    private CustomerDto.Detail toDetail(ErpPartnerDto p) {
        String hpNo = blankToNull(p.getAsgnrHpNo());
        String telNo = blankToNull(p.getAsgnrTelNo());
        String phone = hpNo != null ? hpNo : telNo;
        return CustomerDto.Detail.builder()
                .partnerCd(p.getPartnerCd())
                .companyName(p.getPartnerNm())
                .contactName(p.getAsgnrNm())
                .contactDept(p.getAsgnrDeptNm())
                .contactPosition(p.getAsgnrOdtyNm())
                .contactEmail(blankToNull(p.getAsgnrEmail()))
                .contactPhone(phone)
                .build();
    }
}
