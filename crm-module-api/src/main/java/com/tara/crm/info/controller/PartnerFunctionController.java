package com.tara.crm.info.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.info.dto.PartnerFunctionDto;
import com.tara.crm.info.service.PartnerFunctionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Info - 영업담당자관리", description = "ERP 거래처별 영업담당자 조회 API")
@RestController
@RequestMapping("/api/info/partner-functions")
@RequiredArgsConstructor
public class PartnerFunctionController {

    private final PartnerFunctionService partnerFunctionService;

    @Operation(summary = "거래처별 영업담당자 목록 조회")
    @GetMapping
    public ApiResponse<Page<PartnerFunctionDto.ListItem>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String partnerCd,
            @RequestParam(required = false) String employeeNo,
            @RequestParam(required = false) String sortField,
            @RequestParam(required = false) String sortDir,
            @RequestParam(required = false) String colFilters,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        PartnerFunctionDto.SearchCondition cond = PartnerFunctionDto.SearchCondition.builder()
                .keyword(keyword)
                .partnerCd(partnerCd)
                .employeeNo(employeeNo)
                .sortField(sortField)
                .sortDir(sortDir)
                .colFilters(parseColFilters(colFilters))
                .page(page)
                .size(size)
                .build();
        return ApiResponse.ok(partnerFunctionService.list(cond));
    }

    /** colFilters JSON 파싱 — 형식이 깨지면 400(INVALID_INPUT). 공용 파서 사용. */
    private java.util.List<com.tara.crm.info.dto.BizOwnerDto.ColumnFilter> parseColFilters(String json) {
        return com.tara.crm.common.util.ColumnFilterParser.parse(
                json, new com.fasterxml.jackson.core.type.TypeReference<>() {});
    }
}
