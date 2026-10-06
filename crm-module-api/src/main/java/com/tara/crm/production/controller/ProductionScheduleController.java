package com.tara.crm.production.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.production.repository.OracleProductionScheduleRepository;
import com.tara.crm.production.repository.OracleProductionScheduleRepository.Tab;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 생산현황 > 생산일정현황 (TPS). ERP 인쇄·제본·코팅 생산일정현황 이식. 조회 전용, 데이터 범위 없음(생산현황 화면 공통 결정).
 */
@RestController
@RequestMapping("/api/production/schedule")
@RequiredArgsConstructor
public class ProductionScheduleController {

    private static final long MAX_RANGE_DAYS = 31;
    /** 설비 유형(PM_EQ_DTL.EQP_TP_CD) — 인쇄 201~203, 코팅 301, 제본 401~408. 화면 목록과 같다. */
    private static final Set<String> EQP_TYPES = Set.of("201", "202", "203", "301", "401", "402", "403", "404", "405", "406", "407", "408");
    private static final Pattern SEARCH = Pattern.compile("^[A-Za-z0-9_-]{0,30}$");

    private final Optional<OracleProductionScheduleRepository> repository;

    /** tab = print(인쇄) / bind(제본) / coat(코팅). eqpTp 없으면 설비 유형 전체. planNo·orderNo 는 부분 일치. */
    @GetMapping("/{tab}")
    @Operation(summary = "생산일정현황 — 탭별 행 (계획일 기간 최대 31일, 설비 유형·계획번호·주문번호 필터)")
    public ApiResponse<List<Map<String, Object>>> rows(@PathVariable String tab,
                                                       @RequestParam String startDate, @RequestParam String endDate,
                                                       @RequestParam(required = false) String eqpTp,
                                                       @RequestParam(required = false) String planNo,
                                                       @RequestParam(required = false) String orderNo) {
        Tab t;
        try {
            t = Tab.valueOf(tab.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 탭입니다: " + tab);
        }
        LocalDate start = LocalDate.parse(startDate);
        LocalDate end = LocalDate.parse(endDate);
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        if (eqpTp != null && !eqpTp.isBlank() && !EQP_TYPES.contains(eqpTp)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 설비 유형입니다: " + eqpTp);
        }
        OracleProductionScheduleRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        return ApiResponse.ok(oracle.findRows(t, start, end, eqpTp, search(planNo), search(orderNo)));
    }

    private static String search(String v) {
        String s = v == null ? "" : v.trim();
        if (!SEARCH.matcher(s).matches()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "검색어는 영문·숫자 30자 이내입니다: " + v);
        }
        return s;
    }
}
