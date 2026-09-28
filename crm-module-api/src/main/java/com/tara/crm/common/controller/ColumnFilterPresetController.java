package com.tara.crm.common.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.dto.ColumnFilterPresetDto;
import com.tara.crm.common.service.ColumnFilterPresetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 컬럼 필터 저장조건 — 로그인 사용자 본인 것만. 화면 경로에 '/' 가 있어 경로변수 대신 쿼리/본문으로 받는다. */
@Tag(name = "Common - 컬럼 필터 저장조건", description = "목록 화면 th 필터의 저장된 조건 조회/저장/삭제")
@RestController
@RequestMapping("/api/column-filter-presets")
@RequiredArgsConstructor
public class ColumnFilterPresetController {

    private final ColumnFilterPresetService service;

    @Operation(summary = "저장된 조건 목록 — columnId 없으면 화면 전체(모든 컬럼), 있으면 그 컬럼만")
    @GetMapping
    public ApiResponse<List<ColumnFilterPresetDto.Item>> list(@RequestParam String pagePath,
                                                              @RequestParam(required = false) String columnId) {
        return ApiResponse.ok(columnId == null || columnId.isBlank()
            ? service.listByPage(pagePath) : service.list(pagePath, columnId));
    }

    @Operation(summary = "조건 저장 — 값마다 1행, 이미 있는 (조건,값) 은 건너뜀. 저장 후 전체 목록 반환")
    @PostMapping
    public ApiResponse<List<ColumnFilterPresetDto.Item>> save(@RequestBody ColumnFilterPresetDto.SaveRequest body) {
        return ApiResponse.ok(service.save(body));
    }

    @Operation(summary = "조건 삭제 (본인 것만)")
    @DeleteMapping("/{presetId}")
    public ApiResponse<Void> delete(@PathVariable Long presetId) {
        service.delete(presetId);
        return ApiResponse.ok();
    }
}
