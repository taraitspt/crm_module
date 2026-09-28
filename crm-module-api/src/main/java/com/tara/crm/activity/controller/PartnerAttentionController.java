package com.tara.crm.activity.controller;

import com.tara.crm.activity.dto.AttentionDto;
import com.tara.crm.activity.service.PartnerAttentionService;
import com.tara.crm.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@Tag(name = "PartnerAttention", description = "관리 필요 거래처 — 이탈·급감·계획누락·장기미접촉")
@RestController
@RequestMapping("/api/activities/attention")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class PartnerAttentionController {

    private final PartnerAttentionService service;

    @Operation(summary = "관리 필요 거래처 조회",
            description = "올해·작년 ERP 매출, 올해 월매출계획, 영업활동 기록을 합쳐 판정한다. "
                    + "작년은 올해와 같은 월 구간으로 잘라 비교한다. ERP 왕복 5회라 응답이 수 초 걸릴 수 있다.")
    @GetMapping
    public ApiResponse<AttentionDto.Response> find(
            @RequestParam int year,
            /** 조회 시작월. 비우면 1월 */
            @RequestParam(required = false) Integer fromMm,
            /** 조회 종료월. 비우면 올해는 당월, 지난 해는 12월 */
            @RequestParam(required = false) Integer toMm,
            /** 이 금액 미만의 소액 거래처는 제외(계획에 올라온 곳은 금액과 무관하게 포함) */
            @RequestParam(defaultValue = "10000000") long minAmt,
            /** 이 일수를 넘게 접촉 기록이 없으면 '장기 미접촉' */
            @RequestParam(defaultValue = "60") int noContactDays,
            /** 작년 대비 이 비율(%) 이상이면 '성장' */
            @RequestParam(defaultValue = "130") int growthRate,
            /** 올해 매출 상위 이 순위까지 'VIP' */
            @RequestParam(defaultValue = "20") int vipTopN,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) String deptCd,
            /**
             * 사업부문 — 기본 1000(타라티피에스). 전체를 보려면 "ALL".
             * (스프링은 @RequestParam 빈 문자열을 defaultValue 로 바꿔버려서 ""를 '전체'로 쓸 수 없다)
             */
            @RequestParam(required = false, defaultValue = "1000") String plantCd) {
        int lo = clampMonth(fromMm, 1);
        int hi = clampMonth(toMm, defaultToMm(year));
        if (lo > hi) lo = hi;
        return ApiResponse.ok(service.find(year, lo, hi, minAmt, noContactDays, growthRate, vipTopN,
                reason, deptCd, normalizePlant(plantCd)));
    }

    /**
     * 기본 종료월 — 올해면 당월, 지난 해면 12월.
     * 연중에 12월까지 잡으면 올해만 덜 찬 채로 작년과 비교돼 멀쩡한 거래처가 '급감'으로 찍힌다.
     */
    static int defaultToMm(int year) {
        LocalDate today = LocalDate.now();
        return year == today.getYear() ? today.getMonthValue() : 12;
    }

    private static int clampMonth(Integer mm, int fallback) {
        if (mm == null) return fallback;
        return Math.min(Math.max(mm, 1), 12);
    }

    /** "ALL"/빈값 → null(전체). 그 외는 그대로. */
    public static String normalizePlant(String plantCd) {
        if (plantCd == null || plantCd.isBlank() || "ALL".equalsIgnoreCase(plantCd.trim())) return null;
        return plantCd.trim();
    }
}
