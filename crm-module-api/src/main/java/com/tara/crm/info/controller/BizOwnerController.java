package com.tara.crm.info.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.dto.BizOwnerDto;
import com.tara.crm.info.repository.BusinessOwnerRepository;
import com.tara.crm.info.service.BizOwnerService;
import com.tara.crm.integration.erp.repository.ErpPartnerRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@Tag(name = "Info - 사업자관리", description = "사업자 CRUD API")
@RestController
@RequestMapping("/api/info/biz-owners")
@RequiredArgsConstructor
public class BizOwnerController {

    private final BizOwnerService bizOwnerService;
    private final BusinessOwnerRepository businessOwnerRepository;

    @Autowired(required = false)
    private ErpPartnerRepository erpPartnerRepository;

    @Operation(summary = "업태 자동완성")
    @GetMapping("/biz-types")
    public ApiResponse<List<String>> searchBizTypes(@RequestParam(defaultValue = "") String keyword) {
        // 오라클 DB가 활성화되어 있으면 오라클에서 조회, 없으면 기본 DB에서 조회
        if (erpPartnerRepository != null) {
            return ApiResponse.ok(erpPartnerRepository.findDistinctBizTypes(keyword));
        } else {
            Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
            if (companyCd == null) companyCd = 1000;
            return ApiResponse.ok(businessOwnerRepository.findDistinctBizTypes(companyCd, keyword));
        }
    }

    @Operation(summary = "종목 자동완성")
    @GetMapping("/biz-items")
    public ApiResponse<List<String>> searchBizItems(@RequestParam(defaultValue = "") String keyword) {
        // 오라클 DB가 활성화되어 있으면 오라클에서 조회, 없으면 기본 DB에서 조회
        if (erpPartnerRepository != null) {
            return ApiResponse.ok(erpPartnerRepository.findDistinctBizItems(keyword));
        } else {
            Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
            if (companyCd == null) companyCd = 1000;
            return ApiResponse.ok(businessOwnerRepository.findDistinctBizItems(companyCd, keyword));
        }
    }

    @Operation(summary = "사업자 목록 조회")
    @GetMapping
    public ApiResponse<Page<BizOwnerDto.ListItem>> list(
            @RequestParam(required = false) String plantCd,
            @RequestParam(required = false) String deptCd,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String sortField,
            @RequestParam(required = false) String sortDir,
            @RequestParam(required = false) String colFilters,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Integer plantCdInt = parseIntSafe(plantCd);
        Integer deptCdInt = parseIntSafe(deptCd);
        BizOwnerDto.SearchCondition cond = BizOwnerDto.SearchCondition.builder()
                .plantCd(plantCdInt).deptCd(deptCdInt).keyword(keyword)
                .sortField(sortField).sortDir(sortDir)
                .colFilters(parseColFilters(colFilters))
                .page(page).size(size).build();
        return ApiResponse.ok(bizOwnerService.list(cond));
    }

    /** colFilters JSON 파싱 — 형식이 깨지면 400(INVALID_INPUT). 공용 파서 사용. */
    private List<BizOwnerDto.ColumnFilter> parseColFilters(String json) {
        return com.tara.crm.common.util.ColumnFilterParser.parse(
                json, new com.fasterxml.jackson.core.type.TypeReference<>() {});
    }

    private static Integer parseIntSafe(String s) {
        if (s == null || s.isBlank()) return null;
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
    }

    @Operation(summary = "사업자 상세 조회")
    @GetMapping("/{id}")
    public ApiResponse<BizOwnerDto.Detail> detail(@PathVariable String id) {
        return ApiResponse.ok(bizOwnerService.getDetail(id));
    }

    @Operation(summary = "사업자 등록")
    @PostMapping
    public ApiResponse<BizOwnerDto.Detail> create(@RequestBody BizOwnerDto.CreateRequest request) {
        return ApiResponse.ok(bizOwnerService.create(request));
    }

    @Operation(summary = "사업자 수정")
    @PutMapping("/{id}")
    public ApiResponse<BizOwnerDto.Detail> update(
            @PathVariable String id,
            @RequestBody BizOwnerDto.UpdateRequest request) {
        return ApiResponse.ok(bizOwnerService.update(id, request));
    }

    @Operation(summary = "사업자 삭제")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        bizOwnerService.delete(id);
        return ApiResponse.ok();
    }
}
