package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.stats.service.SoCostCenterService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/** 매출 > 수주 담당팀 점검 — 수주 비용센터 vs 영업담당자 소속 대조. ERP 조회 전용. */
@RestController
@RequestMapping("/api/stats/so-cc-check")
@RequiredArgsConstructor
public class SoCostCenterController {

    private static final long MAX_RANGE_DAYS = 93;

    private final SoCostCenterService service;

    @GetMapping
    @Operation(summary = "수주 담당팀 점검 — 수주일 기간(최대 93일), 수주마다 CC 와 담당자 소속 CC, 판정(MATCH/MISMATCH/NO_USER/NO_CC)")
    public ApiResponse<List<Map<String, Object>>> rows(@RequestParam String startDate, @RequestParam String endDate) {
        LocalDate start = LocalDate.parse(startDate);
        LocalDate end = LocalDate.parse(endDate);
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        return ApiResponse.ok(service.check(start, end));
    }
}
