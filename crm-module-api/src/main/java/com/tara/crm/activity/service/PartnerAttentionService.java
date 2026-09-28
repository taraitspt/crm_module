package com.tara.crm.activity.service;

import com.tara.crm.activity.dto.AttentionDto;
import com.tara.crm.activity.entity.SalesActivity;
import com.tara.crm.activity.repository.SalesActivityRepository;
import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.menu.CrmResource;
import com.tara.crm.common.service.ScopeService;
import com.tara.crm.common.util.DataScope;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.entity.SalesPlan;
import com.tara.crm.info.repository.SalesPlanRepository;
import com.tara.crm.stats.repository.OracleStatsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 관리 필요 거래처 판정.
 *
 * 세 소스를 합친다.
 *  - ERP 매출전표(Oracle): 올해·작년 같은 기간의 거래처별 매출, 그리고 기간과 무관한 마지막 거래일
 *  - 월매출계획(sales_plan): 올해 계획에 올라와 있는지, 담당자가 누군지
 *  - 영업활동(sales_activity): 거래처별 마지막 접촉일
 *
 * ERP 왕복이 5회(총액·부서별 × 올해·작년 + 마지막 거래일) 있어 가볍지 않다. 조회조건을 바꿀 때만 다시 부른다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerAttentionService {

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;
    /** 올해 매출이 작년의 이 비율 미만이면 '급감'으로 본다. */
    private static final double DECLINE_RATIO = 0.5;

    private final Optional<OracleStatsRepository> oracleStatsRepository;
    private final SalesPlanRepository salesPlanRepository;
    private final SalesActivityRepository salesActivityRepository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final ScopeService scopeService;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    /** ERP 한 해치 집계 결과 한 줄 */
    private record YearRow(String partnerCd, String partnerNm, String deptCd, String deptNm,
                           long amt, LocalDate lastDt) {}

    /** 한 해치 거래처 × 부서(비용센터) 매출을 out 에 채운다. 부서는 금액 큰 순. */
    private void loadPartnerDepts(int year, int fromMm, int toMm, String plantCd,
                                  Map<String, int[]> ccToDept, Map<Integer, String> deptNames,
                                  Map<String, List<AttentionDto.DeptShare>> out) {
        Map<String, Map<String, Long>> byPartnerCc = new HashMap<>();
        for (Object[] r : oracleStatsRepository.get().getPartnerCcTotals(year, fromMm, toMm, plantCd)) {
            String pc = r[0] == null ? "" : r[0].toString().trim();
            String cc = r[1] == null ? "" : r[1].toString().trim();
            if (pc.isEmpty() || cc.isEmpty()) continue;
            byPartnerCc.computeIfAbsent(pc, k -> new HashMap<>())
                    .merge(cc, ((Number) r[2]).longValue(), Long::sum);
        }
        byPartnerCc.forEach((pc, ccMap) -> out.put(pc, ccMap.entrySet().stream()
                .map(e -> {
                    int[] dept = ccToDept.get(e.getKey());
                    Integer dc = dept == null ? null : dept[0];
                    return AttentionDto.DeptShare.builder()
                            .deptCd(dc)
                            .deptNm(dc == null ? null : deptNames.get(dc))
                            .ccCd(e.getKey())
                            .amt(e.getValue())
                            .build();
                })
                .sorted(Comparator.comparingLong(AttentionDto.DeptShare::getAmt).reversed())
                .toList()));
    }

    /**
     * 거래처 한 줄이 내 범위 안인가.
     *
     * 거래처는 사람이 아니라 부서/계획 담당자에 묶이므로 담당자 집합만으로는 못 자른다.
     *  SELF - 내가 계획 담당자인 거래처만
     *  DEPT - 내 부서가 매출을 올렸거나, 계획 담당자가 우리 부서인 거래처
     */
    private static boolean inMyScope(DataScope scope, Integer myDeptCd, String myEmpId,
                                     List<AttentionDto.DeptShare> depts,
                                     String ownerId, Integer ownerDeptCd) {
        if (scope == DataScope.ALL) return true;
        if (scope == DataScope.NONE) return false;
        if (myEmpId != null && myEmpId.equals(ownerId)) return true;
        if (scope == DataScope.SELF) return false;
        if (myDeptCd == null) return false;
        if (Objects.equals(myDeptCd, ownerDeptCd)) return true;
        return depts.stream().anyMatch(d -> Objects.equals(myDeptCd, d.getDeptCd()));
    }

    public AttentionDto.Response find(int year, int fromMm, int toMm, long minAmt, int noContactDays,
                                      int growthRate, int vipTopN,
                                      String reason, String deptCd, String plantCd) {
        // 매출현황과 같은 범위를 쓴다 — 관리자 화면에서 SALES_STATS 를 부서로 좁히면 여기도 같이 좁아진다.
        DataScope statsScope = scopeService.scopeOf(CrmResource.SALES_STATS);
        Integer myDeptCd = scopeService.currentDeptCd();
        String myEmpId = scopeService.currentUserId();

        Map<String, YearRow> cur = new LinkedHashMap<>();
        Map<String, YearRow> prev = new LinkedHashMap<>();
        /** 거래처 → 진짜 마지막 거래일. 금액과 달리 조회 기간에 묶이면 안 된다. */
        Map<String, LocalDate> lastBill = new HashMap<>();
        boolean erpAvailable = false;
        String erpMessage = null;

        if (oracleStatsRepository.isPresent()) {
            try {
                load(oracleStatsRepository.get().getPartnerYearTotals(year, fromMm, toMm, plantCd), cur);
                load(oracleStatsRepository.get().getPartnerYearTotals(year - 1, fromMm, toMm, plantCd), prev);
                for (Object[] r : oracleStatsRepository.get().getPartnerLastBillDt(year, plantCd)) {
                    String pc = r[0] == null ? "" : r[0].toString().trim();
                    LocalDate dt = parseDt(r[1]);
                    if (!pc.isEmpty() && dt != null) lastBill.put(pc, dt);
                }
                erpAvailable = true;
            } catch (Exception e) {
                Throwable root = e;
                while (root.getCause() != null && root.getCause() != root) root = root.getCause();
                log.warn("[attention] ERP 매출 조회 실패: {}", root.getMessage());
                erpMessage = "ERP 매출을 가져오지 못해 이탈·급감·계획누락 판정을 할 수 없습니다: " + root.getMessage();
            }
        } else {
            erpMessage = "ERP(Oracle) 연결이 비활성화되어 매출 기반 판정을 할 수 없습니다.";
        }

        // 올해 계획 — 거래처별 금액과 담당자.
        // 금액은 조회 기간에 해당하는 달만 더한다(3개월 실적을 12개월 계획과 비교하지 않도록).
        // 담당자는 기간과 무관하게 잡는다 — 하반기 계획만 있는 거래처도 담당자는 있어야 한다.
        Map<String, Long> planAmt = new HashMap<>();
        Map<String, String> planOwner = new HashMap<>();
        for (SalesPlan p : salesPlanRepository.findByYear(companyCd(), String.valueOf(year))) {
            String pc = p.getId().getPartnerCd();
            int mm = Integer.parseInt(p.getId().getPlanMm());
            if (mm >= fromMm && mm <= toMm) {
                planAmt.merge(pc, nz(p.getLaborAmt()) + nz(p.getPaperAmt()), Long::sum);
            }
            planOwner.putIfAbsent(pc, p.getId().getSalesEmpId());
        }

        // 거래처 × 부서 — 그 거래처에 매출을 올린 부서들. 계획과 무관하게 ERP 전표에서 뽑는다.
        // 작년치도 같이 받는다: 이탈(올해 매출 0)은 올해 전표가 없어 올해만 보면 전부 '미지정'이 된다.
        Map<String, List<AttentionDto.DeptShare>> partnerDepts = new HashMap<>();
        Map<String, List<AttentionDto.DeptShare>> partnerDeptsPrev = new HashMap<>();
        if (erpAvailable) {
            try {
                Map<String, int[]> ccToDept = ccToDeptMap();   // cc_cd → {deptCd}
                Map<Integer, String> deptNames = deptNameMap();
                loadPartnerDepts(year, fromMm, toMm, plantCd, ccToDept, deptNames, partnerDepts);
                loadPartnerDepts(year - 1, fromMm, toMm, plantCd, ccToDept, deptNames, partnerDeptsPrev);
            } catch (Exception e) {
                log.warn("[attention] 거래처별 담당부서 산출 실패: {}", e.getMessage());
            }
        }

        // 거래처별 마지막 영업활동일
        Map<String, LocalDate> lastActivity = new HashMap<>();
        for (SalesActivity a : salesActivityRepository.findAll()) {
            if (a.getPartnerCd() == null || !Objects.equals(a.getCompanyCd(), companyCd())) continue;
            lastActivity.merge(a.getPartnerCd(), a.getActivityDt(),
                    (x, y) -> x.isAfter(y) ? x : y);
        }

        Map<String, User> users = userRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(u -> u.getId().getId(), Function.identity(), (x, y) -> x));
        Map<Integer, String> deptNames = deptNameMap();

        Set<String> all = new LinkedHashSet<>();
        all.addAll(cur.keySet());
        all.addAll(prev.keySet());
        // 월매출계획은 타라티피에스(1000) 조직의 계획이다.
        // 그래픽스·PM 사업부문을 보고 있을 땐 계획만 있는 거래처를 끼워 넣지 않는다.
        boolean planBelongsHere = plantCd == null || "1000".equals(plantCd);
        if (planBelongsHere) all.addAll(planAmt.keySet());

        // 올해 매출 순위 — VIP 판정 기준. 매출이 있는 거래처만 순위를 매긴다.
        Map<String, Integer> salesRank = new HashMap<>();
        List<YearRow> ranked = cur.values().stream()
                .filter(r -> r.amt() > 0)
                .sorted(Comparator.comparingLong(YearRow::amt).reversed())
                .toList();
        for (int i = 0; i < ranked.size(); i++) salesRank.put(ranked.get(i).partnerCd(), i + 1);
        double growthRatio = growthRate / 100.0;

        LocalDate today = LocalDate.now();
        List<AttentionDto.Item> items = new ArrayList<>();
        for (String pc : all) {
            YearRow c = cur.get(pc);
            YearRow p = prev.get(pc);
            long curAmt = c != null ? c.amt() : 0L;
            long prevAmt = p != null ? p.amt() : 0L;
            // 계획 등록 여부는 기간과 무관하게 본다 — 하반기에만 계획이 있어도 "계획 있음"이다.
            boolean hasPlan = planBelongsHere && planOwner.containsKey(pc);

            // 소액 거래처는 노이즈라 기준 미만이면 뺀다. 단 계획에 올라온 곳은 금액과 무관하게 본다.
            if (!hasPlan && Math.max(curAmt, prevAmt) < minAmt) continue;

            LocalDate act = lastActivity.get(pc);
            Integer daysSince = act == null ? null : (int) ChronoUnit.DAYS.between(act, today);

            Integer rank = salesRank.get(pc);
            List<String> reasons = new ArrayList<>();
            if (erpAvailable) {
                if (prevAmt > 0 && curAmt == 0) reasons.add(AttentionDto.Reason.CHURN.name());
                else if (prevAmt > 0 && curAmt < prevAmt * DECLINE_RATIO) reasons.add(AttentionDto.Reason.DECLINE.name());
                else if (prevAmt > 0 && curAmt >= prevAmt * growthRatio) reasons.add(AttentionDto.Reason.GROWTH.name());
                if (curAmt > 0 && !hasPlan) reasons.add(AttentionDto.Reason.NO_PLAN.name());
                if (prevAmt == 0 && curAmt > 0) reasons.add(AttentionDto.Reason.NEW.name());
                if (rank != null && rank <= vipTopN) reasons.add(AttentionDto.Reason.VIP.name());
            }
            if (hasPlan && (act == null || daysSince > noContactDays)) {
                reasons.add(AttentionDto.Reason.NO_CONTACT.name());
            }
            if (reasons.isEmpty()) continue;
            if (reason != null && !reason.isBlank() && !reasons.contains(reason)) continue;

            YearRow ref = c != null ? c : p;
            String ownerId = planOwner.get(pc);
            User owner = ownerId != null ? users.get(ownerId) : null;

            // 담당부서 = 그 거래처에 매출을 올린 부서들(복수 가능).
            // 계획이 없어도 잡히고, 여러 팀이 한 거래처를 나눠 담당하는 경우도 그대로 보여준다.
            List<AttentionDto.DeptShare> depts = partnerDepts.getOrDefault(pc, List.of());
            boolean deptFromPrevYear = false;
            if (depts.isEmpty()) {
                // 이탈처럼 올해 전표가 없는 거래처는 작년에 팔던 부서가 담당부서다.
                depts = partnerDeptsPrev.getOrDefault(pc, List.of());
                deptFromPrevYear = !depts.isEmpty();
            }
            if (depts.isEmpty() && owner != null && owner.getDeptCd() != null) {
                // ERP 매출이 아예 없고 계획만 있는 거래처는 계획 담당자의 부서로 대신 채운다.
                depts = List.of(AttentionDto.DeptShare.builder()
                        .deptCd(owner.getDeptCd()).deptNm(deptNames.get(owner.getDeptCd())).amt(0).build());
            }
            if (deptCd != null && !deptCd.isBlank()) {
                boolean match = depts.stream()
                        .anyMatch(x -> x.getDeptCd() != null && deptCd.equals(String.valueOf(x.getDeptCd())));
                if (!match) continue;
            }
            if (!inMyScope(statsScope, myDeptCd, myEmpId, depts, ownerId,
                    owner != null ? owner.getDeptCd() : null)) continue;
            String rowDeptNm = depts.isEmpty() ? null
                    : depts.stream()
                    .map(x -> x.getDeptNm() != null ? x.getDeptNm() : "CC " + x.getCcCd())
                    .distinct()
                    .collect(Collectors.joining(", "));

            items.add(AttentionDto.Item.builder()
                    .partnerCd(pc)
                    .partnerNm(ref != null ? ref.partnerNm() : pc)
                    .depts(depts)
                    .deptFromPrevYear(deptFromPrevYear)
                    .deptNm(rowDeptNm)
                    .prevAmt(prevAmt)
                    .curAmt(curAmt)
                    .changeRate(prevAmt > 0 ? Math.round(((double) curAmt / prevAmt) * 1000) / 10.0 : null)
                    // 기간 밖이어도 실제 마지막 거래일. 못 구했을 때만 기간 안의 값으로 떨어진다.
                    .lastBillDt(lastBill.getOrDefault(pc,
                            c != null ? c.lastDt() : (p != null ? p.lastDt() : null)))
                    .hasPlan(hasPlan)
                    .planAmt(planAmt.getOrDefault(pc, 0L))
                    .ownerEmpId(ownerId)
                    .ownerNm(owner != null ? owner.getName() : ownerId)
                    .lastActivityDt(act)
                    .daysSinceActivity(daysSince)
                    .salesRank(rank)
                    .reasons(reasons)
                    .build());
        }

        // 놓쳤을 때 손해가 큰 순 — 작년/올해 중 큰 금액 기준
        items.sort(Comparator.comparingLong((AttentionDto.Item i) -> Math.max(i.getPrevAmt(), i.getCurAmt())).reversed());

        Map<String, Integer> byReason = new LinkedHashMap<>();
        for (AttentionDto.Reason r : AttentionDto.Reason.values()) byReason.put(r.name(), 0);
        items.forEach(i -> i.getReasons().forEach(r -> byReason.merge(r, 1, Integer::sum)));

        return AttentionDto.Response.builder()
                .items(items).byReason(byReason).total(items.size())
                .fromMm(fromMm).toMm(toMm)
                .noContactDays(noContactDays).minAmt(minAmt)
                .growthRate(growthRate).vipTopN(vipTopN)
                .erpAvailable(erpAvailable).erpMessage(erpMessage)
                .build();
    }

    private Map<Integer, String> deptNameMap() {
        return departmentRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (x, y) -> x));
    }

    /**
     * 비용센터코드 → 대표 부서코드.
     * users.cc_cd 기준으로, 한 cc 에 여러 부서가 섞여 있으면 인원이 많은 부서를 대표로 본다.
     * (예: 1201 → 수주1팀, 1501 → 대교영업팀)
     */
    private Map<String, int[]> ccToDeptMap() {
        Map<String, Map<Integer, Integer>> counts = new HashMap<>();
        for (User u : userRepository.findAllByCompanyCd(companyCd())) {
            String cc = u.getCcCd();
            if (cc == null || cc.isBlank() || u.getDeptCd() == null) continue;
            counts.computeIfAbsent(cc.trim(), k -> new HashMap<>())
                    .merge(u.getDeptCd(), 1, Integer::sum);
        }
        Map<String, int[]> out = new HashMap<>();
        counts.forEach((cc, m) -> m.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(e -> out.put(cc, new int[]{e.getKey()})));
        return out;
    }

    /** ERP 전표일(yyyyMMdd 문자열) → LocalDate. 비정상 값이면 null. */
    private static LocalDate parseDt(Object v) {
        if (v == null) return null;
        try {
            return LocalDate.parse(v.toString().trim(), BASIC);
        } catch (Exception ignore) {
            return null;
        }
    }

    private void load(List<Object[]> rows, Map<String, YearRow> into) {
        for (Object[] r : rows) {
            String pc = r[0] == null ? "" : r[0].toString().trim();
            if (pc.isEmpty()) continue;
            LocalDate last = parseDt(r[5]);
            into.put(pc, new YearRow(pc,
                    r[1] == null ? pc : r[1].toString(),
                    r[2] == null ? null : r[2].toString().trim(),
                    r[3] == null ? null : r[3].toString(),
                    ((Number) r[4]).longValue(), last));
        }
    }

    private static long nz(Long v) {
        return v == null ? 0L : v;
    }
}
