package com.tara.crm.stats.controller;

import com.tara.crm.activity.controller.PartnerAttentionController;
import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.stats.dto.SalesListDto;
import com.tara.crm.stats.service.SalesListService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** 매출리스트 — ERP 매출 상세(매출번호·순번 단위). 데이터 범위는 SALES_STATS(매출현황과 같음). */
@RestController
@RequestMapping("/api/stats/sales-list")
@RequiredArgsConstructor
public class SalesListController {

    private final SalesListService salesListService;

    @GetMapping
    @Operation(summary = "매출리스트 — 기간(최대 92일)·사업부문(기본 1000 TPS, ALL=전체)")
    public ApiResponse<SalesListDto.Response> list(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false, defaultValue = "1000") String plantCd) {
        return ApiResponse.ok(salesListService.list(LocalDate.parse(startDate), LocalDate.parse(endDate),
                PartnerAttentionController.normalizePlant(plantCd)));
    }
}
