package com.tara.crm.production.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.production.repository.OraclePlanRegisterRepository;
import com.tara.crm.production.repository.OraclePlanRegisterRepository.Tab;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 생산현황 > 생산계획조회 (TPS). ERP "생산계획등록(타라)" 화면을 조회 전용으로 옮긴 것 + 라인별 작업지시서.
 * 주문적용(mode=order, SD_ORDER TOR…)과 의뢰적용(mode=request, PP_PREORD PQE…) 두 방향 — 공정 탭 쿼리는 둘이 같아 mode 가 없다.
 * 데이터 범위(ResourceScope)는 걸지 않는다 — 생산현황 화면들과 같은 결정.
 */
@RestController
@RequestMapping("/api/production/plan-register")
@RequiredArgsConstructor
public class PlanRegisterController {

    /** 주문리스트 한 번에 조회할 수 있는 최대 기간(일). CTE 가 많아 한 달이 한계. */
    private static final long MAX_RANGE_DAYS = 31;
    /** 주문번호(TOR…)·계획번호(PPN…) 형식 — 바인딩이라 안전하지만 엉뚱한 값은 미리 거른다. */
    private static final Pattern DOC_NO = Pattern.compile("^[A-Za-z0-9_-]{1,30}$");

    private final Optional<OraclePlanRegisterRepository> repository;

    @GetMapping("/orders")
    @Operation(summary = "주문리스트 — 주문일 기간(최대 31일), 계획번호·계획상태(미작성/작성중/작성 완료)·탭별 확정여부")
    public ApiResponse<List<Map<String, Object>>> orders(@RequestParam String startDate, @RequestParam String endDate,
                                                         @RequestParam(defaultValue = "order") String mode) {
        LocalDate start = LocalDate.parse(startDate);
        LocalDate end = LocalDate.parse(endDate);
        if (end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        return ApiResponse.ok(oracle().findOrders(start, end, isRequest(mode, null)));
    }

    @GetMapping("/orders/{orderNo}/detail")
    @Operation(summary = "주문상세 — 주문 라인(계획이 있으면 계획값). planNo 없으면 주문값만")
    public ApiResponse<List<Map<String, Object>>> detail(@PathVariable String orderNo, @RequestParam(required = false) String planNo,
                                                         @RequestParam(required = false) String mode) {
        String no = docNo(orderNo);
        return ApiResponse.ok(oracle().findOrderDetail(no, planNo == null || planNo.isBlank() ? null : docNo(planNo), isRequest(mode, no)));
    }

    @GetMapping("/plans/{planNo}/{tab}")
    @Operation(summary = "계획 공정 탭 행 — tab = print|plate|process|fold|bind, 계획번호 1건")
    public ApiResponse<List<Map<String, Object>>> tabRows(@PathVariable String planNo, @PathVariable String tab,
                                                          @RequestParam(required = false) String orderNo) {
        Tab t;
        try {
            t = Tab.valueOf(tab.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 탭입니다: " + tab);
        }
        return ApiResponse.ok(oracle().findTabRows(t, docNo(planNo), orderNo == null || orderNo.isBlank() ? null : docNo(orderNo)));
    }

    /**
     * 작업지시서 — 주문상세 순번(라인) 하나당 한 장(사용자 결정 2026-10-02). sq 를 주면 그 라인과 그 라인의 인쇄 계획 행만, 없으면 주문 전체.
     * 응답: 머리(head) + 주문 라인(lines) + 인쇄 계획 행(printRows). 화면이 양식(세부품목 → 구성·대수·원고형태·설비·색도·용지·재단규격·면수·터잡기·매수·판수)과 용지현황 합계를 만든다.
     */
    @GetMapping("/work-order/{orderNo}")
    @Operation(summary = "작업지시서 데이터 — 주문 머리 + 라인(sq 로 한 줄) + 인쇄 계획 행")
    public ApiResponse<Map<String, Object>> workOrder(@PathVariable String orderNo, @RequestParam(required = false) Integer sq,
                                                      @RequestParam(required = false) String mode) {
        OraclePlanRegisterRepository oracle = oracle();
        String no = docNo(orderNo);
        boolean request = isRequest(mode, no);
        Map<String, Object> head = oracle.findWorkOrderHead(no, request);
        if (head == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "주문을 찾을 수 없습니다: " + no);
        }
        String planNo = head.get("planNo") == null ? null : String.valueOf(head.get("planNo"));
        Map<String, Object> out = new LinkedHashMap<>();
        head.put("request", request);
        out.put("head", head);
        List<Map<String, Object>> lines = oracle.findOrderDetail(no, planNo, request);
        List<Map<String, Object>> printRows = planNo == null ? List.of() : oracle.findTabRows(Tab.PRINT, planNo, no);
        if (sq != null) {
            lines = lines.stream().filter(r -> sameSq(r.get("orddocSq"), sq)).toList();
            printRows = printRows.stream().filter(r -> sameSq(r.get("orddocSq"), sq)).toList();
            if (lines.isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "주문 순번을 찾을 수 없습니다: " + no + " #" + sq);
            }
        }
        out.put("lines", lines);
        out.put("printRows", printRows);
        return ApiResponse.ok(out);
    }

    private OraclePlanRegisterRepository oracle() {
        return repository.orElseThrow(() -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
    }

    /** 주문적용(order) / 의뢰적용(request). mode 가 없으면 문서번호 머리글자로 — 의뢰는 PQE…, 주문은 TOR…. */
    private static boolean isRequest(String mode, String docNo) {
        if (mode != null && !mode.isBlank()) {
            return switch (mode.toLowerCase(Locale.ROOT)) {
                case "request" -> true;
                case "order" -> false;
                default -> throw new BusinessException(ErrorCode.INVALID_INPUT, "mode 는 order 또는 request 입니다: " + mode);
            };
        }
        return docNo != null && docNo.toUpperCase(Locale.ROOT).startsWith("PQE");
    }

    private static boolean sameSq(Object v, int sq) {
        return v instanceof Number num && num.intValue() == sq;
    }

    private static String docNo(String v) {
        String s = v == null ? "" : v.trim();
        if (!DOC_NO.matcher(s).matches()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "문서번호 형식이 올바르지 않습니다: " + v);
        }
        return s;
    }
}
