package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.stats.dto.PodProductionDto;
import com.tara.crm.stats.repository.OraclePodProductionRepository;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/stats/pod-production")
@RequiredArgsConstructor
public class PodProductionController {

    private final Optional<OraclePodProductionRepository> repository;

    @GetMapping
    @Operation(summary = "POD 생산내역")
    public ApiResponse<List<PodProductionDto.Row>> rows(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) String workPlaceCd,
            @RequestParam(required = false) String itemType,
            @RequestParam(required = false) String salesDepartmentCd,
            @RequestParam(required = false) String salesEmployee,
            @RequestParam(required = false) String keyword) {
        OraclePodProductionRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        // 검색어는 ERP 주문번호 기준으로 Oracle 에 그대로 전달한다 (CRM 주문 매핑 없음).
        String oracleKeyword = (keyword == null || keyword.isBlank()) ? keyword : keyword.trim();
        List<PodProductionDto.Row> rows = oracle.findRows(LocalDate.parse(startDate), LocalDate.parse(endDate),
                workPlaceCd, itemType, salesDepartmentCd, salesEmployee, oracleKeyword);
        return ApiResponse.ok(rows);
    }

    @GetMapping("/details")
    @Operation(summary = "POD 생산내역 선택 행 상세")
    public ApiResponse<List<PodProductionDto.Detail>> details(
            @RequestParam String orderNo,
            @RequestParam int orderSq) {
        OraclePodProductionRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        return ApiResponse.ok(oracle.findDetails(orderNo, orderSq));
    }

    @GetMapping("/specs")
    @Operation(summary = "POD 전체 작업사양 (주문일 기준 flat) — G0500")
    public ApiResponse<List<PodProductionDto.SpecRow>> specs(
            @RequestParam String startDate,
            @RequestParam String endDate) {
        OraclePodProductionRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        return ApiResponse.ok(oracle.findAllSpecs(LocalDate.parse(startDate), LocalDate.parse(endDate)));
    }
}
