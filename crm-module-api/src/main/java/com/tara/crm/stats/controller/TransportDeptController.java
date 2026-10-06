package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.stats.service.TransportDeptService;
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

/** 매출 > 데이터 점검 > 운송정보 부서 점검 — 운송정보 부서(비용센터) vs 수주 라인 비용센터. ERP 조회 전용. 권한 키는 /stats/data-check. */
@RestController
@RequestMapping("/api/stats/transport-dept-check")
@RequiredArgsConstructor
public class TransportDeptController {

    private static final long MAX_RANGE_DAYS = 93;

    private final TransportDeptService service;

    @GetMapping
    @Operation(summary = "운송정보 부서 점검 — 등록일 기간(최대 93일), 행마다 부서 CC 와 수주 라인 CC, 판정(MATCH/MISMATCH/NO_SO/SO_MIXED/NO_DEPT_CC)")
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
