package com.tara.crm.stats.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.stats.service.StatsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * [임시 진단] 거래처별 매출증감 사업자번호 미표시 원인 규명용.
 * /api/public/** 라 로그인 없이 브라우저로 바로 확인 가능(JWT 헤더 불필요).
 * 핵심 확인 포인트: jdbc_url / db_identity(운영 Oracle 인가?) + ci_direct/sa_info(데이터 존재?) + findBizNoByPartnerCd(해소결과).
 * ★검증 후 반드시 제거.
 */
@Tag(name = "[임시] 사업자번호 진단")
@RestController
@RequestMapping("/api/public/diag")
@RequiredArgsConstructor
public class BizNoDiagController {

    private final StatsService statsService;

    @Operation(summary = "[임시] 거래처 사업자번호 해소 진단 (검증 후 제거)")
    @GetMapping("/bizno")
    public ApiResponse<Map<String, Object>> bizno(@RequestParam String partnerCd) {
        return ApiResponse.ok(statsService.diagnoseBizNo(partnerCd));
    }
}
