package com.tara.crm.activity.controller;

import com.tara.crm.activity.dto.ActivityDto;
import com.tara.crm.activity.service.ActivityService;
import com.tara.crm.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@Tag(name = "SalesActivity", description = "영업활동 — 캘린더 / 일자별 현황 / 이력 / 거래처 히스토리")
@RestController
@RequestMapping("/api/activities")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ActivityController {

    private final ActivityService activityService;

    @Operation(summary = "영업활동 목록 (기간 + 선택조건)")
    @GetMapping
    public ApiResponse<List<ActivityDto.Item>> list(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String salesEmpId,
            @RequestParam(required = false) String partnerCd,
            @RequestParam(required = false) String activityType,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(activityService.search(from, to, salesEmpId, partnerCd, activityType, keyword));
    }

    @Operation(summary = "캘린더 — 월별 일자 집계")
    @GetMapping("/calendar")
    public ApiResponse<List<ActivityDto.CalendarDay>> calendar(
            @RequestParam int year,
            @RequestParam int month,
            @RequestParam(required = false) String salesEmpId,
            @RequestParam(required = false) String partnerCd) {
        return ApiResponse.ok(activityService.calendar(year, month, salesEmpId, partnerCd));
    }

    @Operation(summary = "일자별 영업현황 보드 (행=담당자 또는 거래처, 열=일자)")
    @GetMapping("/board")
    public ApiResponse<ActivityDto.Board> board(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "EMP") String groupBy,
            @RequestParam(required = false) String salesEmpId,
            @RequestParam(required = false) String partnerCd) {
        return ApiResponse.ok(activityService.board(from, to, groupBy, salesEmpId, partnerCd));
    }

    @Operation(summary = "수주 추진에 달린 활동 목록")
    @GetMapping("/by-deal/{dealId}")
    public ApiResponse<List<ActivityDto.Item>> byDeal(@PathVariable Long dealId) {
        return ApiResponse.ok(activityService.byDeal(dealId));
    }

    @Operation(summary = "팔로업 예정 목록 (다음 액션 예정일 기준)")
    @GetMapping("/follow-ups")
    public ApiResponse<List<ActivityDto.Item>> followUps(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String salesEmpId) {
        return ApiResponse.ok(activityService.followUps(from, to, salesEmpId));
    }

    @Operation(summary = "거래처별 히스토리 (전체 기간 타임라인)")
    @GetMapping("/partner/{partnerCd}")
    public ApiResponse<ActivityDto.PartnerHistory> partnerHistory(@PathVariable String partnerCd) {
        return ApiResponse.ok(activityService.partnerHistory(partnerCd));
    }

    @Operation(summary = "영업활동 등록")
    @PostMapping
    public ApiResponse<Long> create(@Valid @RequestBody ActivityDto.SaveRequest request) {
        return ApiResponse.ok(activityService.create(request));
    }

    @Operation(summary = "영업활동 수정")
    @PutMapping("/{id}")
    public ApiResponse<Void> update(@PathVariable Long id, @Valid @RequestBody ActivityDto.SaveRequest request) {
        activityService.update(id, request);
        return ApiResponse.ok();
    }

    @Operation(summary = "영업활동 삭제")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        activityService.delete(id);
        return ApiResponse.ok();
    }
}
