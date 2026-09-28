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
 *
 * 채권율·회수기한은 TPS·GRP·PM 모두 내려주지 않는다 — 산식(분모를 매출액으로 할지 외상매출금 발생액으로 할지,
 * 부가세·선매출차감·신판재고이관 처리)을 사용자가 정할 때까지 "산식 미정"(2026-09-28 사용자 지시). 임의로 분모를 골라 채우지 않는다.
 * 참고 사실: 채권잔액은 구조상 부가세 포함(외상매출금 차변 = 공급가 + 부가세예수금)이고, 2026-08 부터 GRP·PM 매출은
 * SD_BILL(매출모듈)에 없고 회계전표(FI_DOCU)에만 있으며, 선매출은 발행 때만 외상매출금이 생기고 차감 때는 선수금↔매출만 오간다.
 */
@RestController
@RequestMapping("/api/stats/receivable-aging")
@RequiredArgsConstructor
public class ReceivableAgingController {

    private final Optional<OracleReceivableAgingRepository> repository;

    @GetMapping
    @Operation(summary = "채권연령분석 — 기준일 시점 잔액·연령버킷, 전년 같은 날 잔액 (채권율·회수기한은 산식 미정이라 미제공)")
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
