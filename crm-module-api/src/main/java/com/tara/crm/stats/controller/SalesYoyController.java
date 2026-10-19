package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.stats.dto.SalesYoyDto;
import com.tara.crm.stats.service.SalesYoyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 매출관리 › 전년 매출 비교 — 올해·작년 ERP 매출(타라티피에스)을 거래처·영업부서·월로. */
@RestController
@RequestMapping("/api/stats/sales-yoy")
@RequiredArgsConstructor
@Tag(name = "Stats", description = "매출 통계")
public class SalesYoyController {

    private final SalesYoyService service;

    @GetMapping
    @Operation(summary = "전년 매출 비교 — year 와 year-1 의 거래처·영업부서별 월 매출(공급가액)")
    public ApiResponse<SalesYoyDto.Response> get(@RequestParam int year) {
        if (year < 2000 || year > 2100) throw new IllegalArgumentException("year");
        return ApiResponse.ok(service.get(year));
    }
}
