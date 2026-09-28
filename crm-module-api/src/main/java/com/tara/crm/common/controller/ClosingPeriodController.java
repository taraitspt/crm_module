package com.tara.crm.common.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.entity.ClosingPeriod;
import com.tara.crm.common.service.ClosingPeriodService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * 매출/세금계산서 월마감 관리 (시트 #2/#14).
 * 관리자 전용. closingType: SALES / TAX
 */
@Tag(name = "Common - 월마감", description = "매출 / 세금계산서 월마감 관리")
@RestController
@RequestMapping("/api/closing")
@RequiredArgsConstructor
public class ClosingPeriodController {

    private final ClosingPeriodService service;

    @Operation(summary = "월마감 목록 조회 (type=SALES|TAX)")
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','FINANCE')")
    public ApiResponse<List<ClosingPeriod>> list(@RequestParam(defaultValue = "SALES") String type) {
        return ApiResponse.ok(service.list(type));
    }

    /** 매출·선매출 등록 화면이 달력에서 마감된 달을 막는 데 쓴다 — 등록하는 사람은 STAFF/MANAGER 라 목록 API(ADMIN/FINANCE)와 분리.
     *  마감 여부만 노출하고 처리자·비고 등은 내려주지 않는다. */
    @Operation(summary = "현재 잠긴 월 목록 (type=SALES|TAX) — 전 역할")
    @GetMapping("/locked-months")
    public ApiResponse<List<String>> lockedMonths(@RequestParam(defaultValue = "SALES") String type) {
        return ApiResponse.ok(service.lockedMonths(type));
    }

    @Operation(summary = "월마감 처리 (즉시 또는 예약)")
    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','FINANCE')")
    public ApiResponse<ClosingPeriod> close(@RequestBody Map<String, Object> body) {
        String type = (String) body.getOrDefault("type", "SALES");
        String ym = (String) body.get("ym");
        String scheduledDtStr = (String) body.get("scheduledDt");
        String note = (String) body.get("note");
        LocalDateTime scheduledDt = parseScheduledDt(scheduledDtStr);
        return ApiResponse.ok(service.close(type, ym, scheduledDt, note));
    }

    /** 브라우저 ISO 문자열(Z/offset)과 기존 로컬 날짜시간 형식을 모두 허용한다. */
    private LocalDateTime parseScheduledDt(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return LocalDateTime.parse(value);
        } catch (DateTimeParseException ignored) {
            return OffsetDateTime.parse(value)
                .atZoneSameInstant(ZoneId.of("Asia/Seoul"))
                .toLocalDateTime();
        }
    }

    @Operation(summary = "월마감 해제")
    @DeleteMapping("/{type}/{ym}")
    @PreAuthorize("hasAnyRole('ADMIN','FINANCE')")
    public ApiResponse<Void> unlock(@PathVariable String type, @PathVariable String ym) {
        service.unlock(type, ym);
        return ApiResponse.ok();
    }
}
