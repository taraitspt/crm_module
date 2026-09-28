package com.tara.crm.info.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.info.dto.CustomerDto;
import com.tara.crm.info.service.CustomerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Info - 고객관리", description = "고객 담당자 조회 API")
@RestController
@RequestMapping("/api/info/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    @Operation(summary = "고객 담당자 목록 조회")
    @GetMapping
    public ApiResponse<Page<CustomerDto.ListItem>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String partnerCd,
            @RequestParam(required = false) String sortField,
            @RequestParam(required = false) String sortDir,
            @RequestParam(required = false) String colFilters,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CustomerDto.SearchCondition cond = CustomerDto.SearchCondition.builder()
                .keyword(keyword).partnerCd(partnerCd)
                .sortField(sortField).sortDir(sortDir)
                .colFilters(parseColFilters(colFilters))
                .page(page).size(size).build();
        return ApiResponse.ok(customerService.list(cond));
    }

    /** colFilters JSON 파싱 — 형식이 깨지면 400(INVALID_INPUT). 공용 파서 사용. */
    private java.util.List<com.tara.crm.info.dto.BizOwnerDto.ColumnFilter> parseColFilters(String json) {
        return com.tara.crm.common.util.ColumnFilterParser.parse(
                json, new com.fasterxml.jackson.core.type.TypeReference<>() {});
    }

    @Operation(summary = "고객 담당자 상세 조회")
    @GetMapping("/{partnerCd}")
    public ApiResponse<CustomerDto.Detail> detail(@PathVariable String partnerCd) {
        return ApiResponse.ok(customerService.getDetailByPartnerCd(partnerCd));
    }
}
