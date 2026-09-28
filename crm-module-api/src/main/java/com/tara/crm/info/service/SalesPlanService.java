package com.tara.crm.info.service;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.id.SalesPlanId;
import com.tara.crm.common.menu.CrmResource;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.dto.SalesPlanDto;
import com.tara.crm.info.entity.SalesPlan;
import com.tara.crm.info.repository.SalesPlanRepository;
import com.tara.crm.stats.repository.OracleStatsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 월매출계획 — 담당자(users)·거래처(ERP 코드)별 공임/용지 월 계획을 저장하고,
 * ERP 매출전표(SD_BILL_MST/DTL) 실적과 비교한 매출현황을 만든다.
 *
 * 실적은 거래처 단위로 ERP 에서 집계한다(부서 무관 합산). 같은 거래처를 두 담당자가 계획에 넣으면
 * 실적이 양쪽에 같은 값으로 표시된다 — 담당자별 실적 분리는 ERP 전표에 담당자 컬럼을 확인한 뒤 붙인다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SalesPlanService {

    private static final List<String> MONTHS = List.of("01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12");

    private final SalesPlanRepository salesPlanRepository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    /** oracle.enabled=false 면 빈이 없다 → 실적 없이 계획만 표시. */
    private final Optional<OracleStatsRepository> oracleStatsRepository;
    private final com.tara.crm.common.service.ScopeService scopeService;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    /** 담당자 선택 옵션 — 활성 사용자. deptCd 가 있으면 그 부서만. */
    public List<SalesPlanDto.UserOption> getUsers(Integer deptCd) {
        Map<Integer, String> deptNames = deptNameMap();
        return userRepository.findAllByCompanyCd(companyCd()).stream()
                .filter(User::isActive)
                .filter(u -> deptCd == null || Objects.equals(u.getDeptCd(), deptCd))
                .sorted(Comparator.comparing(User::getName, Comparator.nullsLast(String::compareTo)))
                .map(u -> SalesPlanDto.UserOption.builder()
                        .id(u.getId().getId())
                        .name(u.getName())
                        .deptCd(u.getDeptCd())
                        .deptNm(deptNames.get(u.getDeptCd()))
                        .build())
                .toList();
    }

    /** 연도별 계획 조회. deptCd / salesEmpId 로 좁힐 수 있다. 행마다 12개월을 모두 채워 준다. */
    public List<SalesPlanDto.PlanRow> getPlans(String planYy, Integer deptCd, String salesEmpId) {
        return getPlans(planYy, deptCd, salesEmpId, CrmResource.SALES_PLAN);
    }

    /**
     * 계획 조회 본체.
     * 같은 데이터라도 어느 리소스로 보느냐에 따라 범위가 다르다 — 계획 입력 화면은 SALES_PLAN,
     * 매출현황은 SALES_STATS 로 읽는다(계획은 본인 것만 만지더라도 회사 실적은 전체를 보는 식).
     */
    private List<SalesPlanDto.PlanRow> getPlans(String planYy, Integer deptCd, String salesEmpId,
                                                CrmResource resource) {
        Map<String, User> users = userMap();
        Map<Integer, String> deptNames = deptNameMap();

        List<SalesPlan> all = salesPlanRepository.findByYear(companyCd(), planYy);

        // 데이터 범위 — (리소스, 역할)로 정해진다. 행마다 달라지지 않으니 루프 밖에서 한 번만 구한다.
        Set<String> allowed = scopeService.resolveFilter(resource,
                salesEmpId == null || salesEmpId.isBlank() ? null : salesEmpId);

        // (담당자, 거래처) 단위로 묶는다. LinkedHashMap 으로 조회 순서(담당자→거래처→월) 유지.
        Map<String, SalesPlanDto.PlanRow> rows = new LinkedHashMap<>();
        for (SalesPlan p : all) {
            String empId = p.getId().getSalesEmpId();
            User u = users.get(empId);
            Integer rowDeptCd = u != null && u.getDeptCd() != null ? u.getDeptCd() : p.getDeptCd();

            if (allowed != null && !allowed.contains(empId)) continue;
            if (deptCd != null && !Objects.equals(rowDeptCd, deptCd)) continue;

            String key = empId + "|" + p.getId().getPartnerCd();
            SalesPlanDto.PlanRow row = rows.computeIfAbsent(key, k -> SalesPlanDto.PlanRow.builder()
                    .salesEmpId(empId)
                    .empNm(u != null ? u.getName() : empId)
                    .deptCd(rowDeptCd)
                    .deptNm(deptNames.get(rowDeptCd))
                    .partnerCd(p.getId().getPartnerCd())
                    .partnerNm(p.getPartnerNm())
                    .months(emptyMonths())
                    .build());
            row.getMonths().stream()
                    .filter(m -> m.getPlanMm().equals(p.getId().getPlanMm()))
                    .findFirst()
                    .ifPresent(m -> {
                        m.setLaborAmt(nz(p.getLaborAmt()));
                        m.setPaperAmt(nz(p.getPaperAmt()));
                    });
        }
        return new ArrayList<>(rows.values());
    }

    /** salesEmpIds 의 해당 연도 계획을 rows 로 통째로 교체. */
    @Transactional
    public void savePlans(SalesPlanDto.SaveRequest req) {
        if (req.getPlanYy() == null || req.getPlanYy().length() != 4) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        Integer companyCd = companyCd();
        Map<String, User> users = userMap();

        Set<String> empIds = new LinkedHashSet<>();
        if (req.getSalesEmpIds() != null) empIds.addAll(req.getSalesEmpIds());
        if (req.getRows() != null) req.getRows().forEach(r -> empIds.add(r.getSalesEmpId()));

        for (String empId : empIds) {
            if (empId == null || empId.isBlank()) throw new BusinessException(ErrorCode.INVALID_INPUT);
            scopeService.assertCanWrite(CrmResource.SALES_PLAN, empId);   // 남의 계획을 대신 저장하지 못하게
            salesPlanRepository.deleteByYearAndEmp(companyCd, req.getPlanYy(), empId);
        }
        salesPlanRepository.flush();

        List<SalesPlan> toSave = new ArrayList<>();
        if (req.getRows() != null) {
            for (SalesPlanDto.PlanRow row : req.getRows()) {
                if (row.getPartnerCd() == null || row.getPartnerCd().isBlank()) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT);
                }
                User u = users.get(row.getSalesEmpId());
                Integer deptCd = u != null && u.getDeptCd() != null ? u.getDeptCd() : row.getDeptCd();
                Map<String, SalesPlanDto.MonthAmt> byMm = row.getMonths() == null ? Map.of()
                        : row.getMonths().stream().collect(Collectors.toMap(
                                SalesPlanDto.MonthAmt::getPlanMm, Function.identity(), (a, b) -> b));
                for (String mm : MONTHS) {
                    SalesPlanDto.MonthAmt m = byMm.get(mm);
                    toSave.add(SalesPlan.builder()
                            .id(new SalesPlanId(companyCd, req.getPlanYy(), mm, row.getSalesEmpId(), row.getPartnerCd().trim()))
                            .deptCd(deptCd)
                            .partnerNm(row.getPartnerNm())
                            .laborAmt(m != null ? nz(m.getLaborAmt()) : 0L)
                            .paperAmt(m != null ? nz(m.getPaperAmt()) : 0L)
                            .build());
                }
            }
        }
        salesPlanRepository.saveAll(toSave);
        log.info("[sales-plan] saved planYy={} emps={} rows={}", req.getPlanYy(), empIds.size(),
                req.getRows() == null ? 0 : req.getRows().size());
    }

    /**
     * 매출현황 — 계획(공임+용지) vs ERP 실적(거래처별 월 매출 합계).
     * plantCd — 사업부문(1000 타라티피에스 / 2000 그래픽스 / 3000 PM). 비우면 전체.
     */
    public SalesPlanDto.StatusResponse getStatus(String planYy, Integer deptCd, String salesEmpId, String plantCd) {
        List<SalesPlanDto.PlanRow> plans = getPlans(planYy, deptCd, salesEmpId, CrmResource.SALES_STATS);

        // partnerCd → (month → amt). ERP 는 거래처·부서별로 내려오므로 부서를 합산한다.
        Map<String, Map<Integer, Long>> actual = new HashMap<>();
        boolean erpAvailable = false;
        String erpMessage = null;
        if (oracleStatsRepository.isPresent()) {
            try {
                int year = Integer.parseInt(planYy);
                for (Object[] r : oracleStatsRepository.get().getCustomerYearlySales(year, null, null, plantCd)) {
                    String partnerCd = r[0] == null ? "" : r[0].toString().trim();
                    int month = ((Number) r[4]).intValue();
                    long amt = ((Number) r[5]).longValue();
                    actual.computeIfAbsent(partnerCd, k -> new HashMap<>()).merge(month, amt, Long::sum);
                }
                erpAvailable = true;
            } catch (Exception e) {
                // SQL 전문 대신 근본 원인(ORA-xxxxx 등)만 화면에 보여준다.
                Throwable root = e;
                while (root.getCause() != null && root.getCause() != root) root = root.getCause();
                String reason = root.getMessage() == null ? e.getClass().getSimpleName() : root.getMessage().trim();
                log.warn("[sales-plan] ERP 실적 조회 실패 — 계획만 표시: {}", reason, e);
                erpMessage = "ERP 실적을 가져오지 못했습니다: " + reason;
            }
        } else {
            erpMessage = "ERP(Oracle) 연결이 비활성화되어 실적을 표시할 수 없습니다.";
        }

        List<SalesPlanDto.StatusRow> rows = new ArrayList<>();
        long planTotal = 0, actualTotal = 0;
        for (SalesPlanDto.PlanRow p : plans) {
            Map<Integer, Long> byMonth = actual.getOrDefault(p.getPartnerCd().trim(), Map.of());
            List<SalesPlanDto.StatusMonth> months = new ArrayList<>();
            long rowPlan = 0, rowActual = 0;
            for (SalesPlanDto.MonthAmt m : p.getMonths()) {
                long labor = nz(m.getLaborAmt());
                long paper = nz(m.getPaperAmt());
                long planAmt = labor + paper;
                long actualAmt = byMonth.getOrDefault(Integer.parseInt(m.getPlanMm()), 0L);
                months.add(new SalesPlanDto.StatusMonth(m.getPlanMm(), planAmt, labor, paper, actualAmt));
                rowPlan += planAmt;
                rowActual += actualAmt;
            }
            rows.add(SalesPlanDto.StatusRow.builder()
                    .deptCd(p.getDeptCd()).deptNm(p.getDeptNm())
                    .salesEmpId(p.getSalesEmpId()).empNm(p.getEmpNm())
                    .partnerCd(p.getPartnerCd()).partnerNm(p.getPartnerNm())
                    .months(months).planTotal(rowPlan).actualTotal(rowActual)
                    .build());
            planTotal += rowPlan;
            actualTotal += rowActual;
        }
        return SalesPlanDto.StatusResponse.builder()
                .rows(rows).planTotal(planTotal).actualTotal(actualTotal)
                .erpAvailable(erpAvailable).erpMessage(erpMessage)
                .build();
    }

    // ── helpers ──
    private Map<String, User> userMap() {
        return userRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(u -> u.getId().getId(), Function.identity(), (a, b) -> a));
    }

    private Map<Integer, String> deptNameMap() {
        return departmentRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (a, b) -> a));
    }

    private static List<SalesPlanDto.MonthAmt> emptyMonths() {
        List<SalesPlanDto.MonthAmt> list = new ArrayList<>(12);
        for (String mm : MONTHS) list.add(new SalesPlanDto.MonthAmt(mm, 0L, 0L));
        return list;
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
