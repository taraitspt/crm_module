package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.stats.dto.ReceivableAgingDto;
import com.tara.crm.stats.repository.OracleReceivableAgingRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Optional;

/**
 * 채권연령분석(관리자) — 더존 채권원장을 기준일 시점 잔액으로 읽어 내려준다. 집계는 화면에서.
 * 사업부는 계정으로 가른다(TPS=국내외상매출금 10801, GRP=그래픽스외상매출금 10805, PM=PM사업외상매출금 10804). 전사 = 셋의 합.
 * 전년 비교는 기준일의 정확히 1년 전 시점 잔액.
 */
@RestController
@RequestMapping("/api/stats/receivable-aging")
@RequiredArgsConstructor
public class ReceivableAgingController {

    private final Optional<OracleReceivableAgingRepository> repository;

    @GetMapping
    @Operation(summary = "채권연령분석 — 기준일 시점 사업부·거래처·계정별 잔액과 연령버킷(30/60/90/120/121+), 전년 같은 날 사업부별 잔액")
    @PreAuthorize("hasAnyRole('ADMIN','FINANCE')")
    public ApiResponse<ReceivableAgingDto> rows(@RequestParam(required = false) String baseDate) {
        OracleReceivableAgingRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        LocalDate base = (baseDate == null || baseDate.isBlank()) ? LocalDate.now() : LocalDate.parse(baseDate);
        LocalDate prev = base.minusYears(1);
        return ApiResponse.ok(ReceivableAgingDto.builder()
                .baseDate(base.toString())
                .rows(oracle.findRows(base))
                .prevBaseDate(prev.toString())
                .prevTotals(oracle.findDivisionTotals(prev))
                .build());
    }
}
