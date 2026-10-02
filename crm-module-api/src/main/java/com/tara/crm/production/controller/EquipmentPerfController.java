package com.tara.crm.production.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.production.repository.OracleEquipmentPerfRepository;
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
import java.util.Optional;
import java.util.Set;

/**
 * 생산현황 > 설비별 작업실적 / 설비 가동 현황 (TPS). ERP 조회 전용.
 * 데이터 범위(ResourceScope)는 걸지 않는다 — 생산계획현황과 같은 결정.
 */
@RestController
@RequestMapping("/api/production/equipment-perf")
@RequiredArgsConstructor
public class EquipmentPerfController {

    /** 한 번에 조회할 수 있는 최대 기간(일). 인쇄 한 달 약 5천 행. */
    private static final long MAX_RANGE_DAYS = 31;
    /** 작업장 그룹(PP_WRKGRP_INFO_X20329.TOP_ORGN_CD) — WC10 제판 / WC20 인쇄 / WC30 후가공 / WC40 제본. 쿼리가 있는 인쇄·제본만 연다. */
    private static final Set<String> WORK_CENTERS = Set.of("WC20", "WC40");

    private final Optional<OracleEquipmentPerfRepository> repository;

    @GetMapping
    @Operation(summary = "설비별 작업실적 — 작업일 기준 (WC20 인쇄 / WC40 제본, 최대 31일)")
    public ApiResponse<List<Map<String, Object>>> rows(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false, defaultValue = "WC20") String workCenter) {
        LocalDate start = LocalDate.parse(startDate);
        LocalDate end = LocalDate.parse(endDate);
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        return ApiResponse.ok(oracle().findRows(start, end, checkWc(workCenter)));
    }

    @GetMapping("/equipments")
    @Operation(summary = "작업장 그룹의 설비 목록 (가동 현황 보드용)")
    public ApiResponse<List<Map<String, Object>>> equipments(
            @RequestParam(required = false, defaultValue = "WC20") String workCenter) {
        return ApiResponse.ok(oracle().findEquipments(checkWc(workCenter)));
    }

    private static String checkWc(String wc) {
        String v = wc == null ? "" : wc.trim().toUpperCase();
        if (!WORK_CENTERS.contains(v)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "지원하지 않는 작업장입니다: " + wc);
        }
        return v;
    }

    private OracleEquipmentPerfRepository oracle() {
        return repository.orElseThrow(() -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
    }
}
