package com.tara.crm.info.service;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.Role;
import com.tara.crm.auth.entity.UserStatus;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.id.GoalMstId;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.info.dto.GoalDto;
import com.tara.crm.info.entity.GoalMst;
import com.tara.crm.info.repository.GoalMstRepository;
import com.tara.crm.integration.erp.repository.ErpDepartmentRepository;
import com.tara.crm.integration.erp.repository.ErpEmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GoalService {

    /** 구성원이 없어도 목표입력에 부서목표 행을 노출할 한영TFT 부서코드. */
    private static final String HANYOUNG_TFT_DEPT_CD = "9950";

    private final GoalMstRepository goalMstRepository;
    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;
    private final Optional<ErpEmployeeRepository> erpEmployeeRepository;
    private final Optional<ErpDepartmentRepository> erpDepartmentRepository;

    private static final String FIELD_PART = "PART";
    private static final String FIELD_AM = "AM";

    /** 목표입력에서 본인 부서만 조회하는 역할 — MANAGER/PART_LEADER/STAFF. (ADMIN 등은 전체/요청범위) */
    private static final Set<String> DEPT_SCOPED_ROLES = Set.of("MANAGER", "PART_LEADER", "STAFF");

    /**
     * 부서한정 역할이면 요청 deptCds 를 무시하고 <b>본인 부서로 강제</b>한다(부서 미지정이면 매칭 불가 sentinel → 빈 결과).
     * 그 외 역할(ADMIN 등)은 요청 deptCds 를 그대로 사용. 서버측 강제라 프론트에서 다른 부서를 넘겨도 안 통한다.
     */
    private List<String> applyDeptScope(List<String> requested) {
        if (!DEPT_SCOPED_ROLES.contains(SecurityContextUtil.getCurrentRole())) return requested;
        Integer dept = SecurityContextUtil.getCurrentDepartmentCd();
        return List.of(dept != null ? String.valueOf(dept) : "__NO_DEPT__");
    }

    /** 파트 목표 조회 */
    public List<GoalDto.PartGoalItem> getPartGoals(String planYy, String planMm) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = SecurityContextUtil.getCurrentPlantCd();
        if (companyCd == null) companyCd = 1000;
        if (plantCd == null) plantCd = 1000;

        Map<String, Long> goalMap = goalMstRepository
            .findByYearMonthAndField(companyCd, plantCd, planYy, planMm, FIELD_PART)
            .stream()
            .collect(Collectors.toMap(g -> g.getId().getDeptCd(), g -> g.getGoalAmt() != null ? g.getGoalAmt() : 0L, (a, b) -> a));

        List<Department> departments = departmentRepository.findAllByCompanyCd(companyCd);
        if (departments.isEmpty()) {
            return goalMap.entrySet().stream()
                .map(e -> GoalDto.PartGoalItem.builder()
                    .deptCd(e.getKey()).deptNm(e.getKey()).goalAmt(e.getValue()).build())
                .collect(Collectors.toList());
        }

        return departments.stream()
            .map(d -> GoalDto.PartGoalItem.builder()
                .deptCd(String.valueOf(d.getId().getDeptCd()))
                .deptNm(Objects.toString(d.getDeptNm(), ""))
                .goalAmt(goalMap.getOrDefault(String.valueOf(d.getId().getDeptCd()), 0L))
                .build())
            .collect(Collectors.toList());
    }

    /** 파트 목표 일괄 upsert */
    @Transactional
    public void savePartGoals(GoalDto.SavePartGoalsRequest request) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = SecurityContextUtil.getCurrentPlantCd();
        if (companyCd == null) companyCd = 1000;
        if (plantCd == null) plantCd = 1000;

        if (request.getGoals() == null || request.getGoals().isEmpty()) return;

        for (GoalDto.PartGoalItem item : request.getGoals()) {
            GoalMstId id = new GoalMstId(companyCd, plantCd,
                request.getPlanYy(), request.getPlanMm(),
                item.getDeptCd(), "", FIELD_PART);
            GoalMst goal = goalMstRepository.findById(id)
                .orElseGet(() -> GoalMst.builder().id(id).build());
            goal.setGoalAmt(item.getGoalAmt());
            goalMstRepository.save(goal);
        }
    }

    /** AM 목표 조회 (단월) */
    public List<GoalDto.AmGoalItem> getAmGoals(String planYy, String planMm) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = SecurityContextUtil.getCurrentPlantCd();
        if (companyCd == null) companyCd = 1000;
        if (plantCd == null) plantCd = 1000;

        Map<String, Long> goalMap = goalMstRepository
            .findByYearMonthAndField(companyCd, plantCd, planYy, planMm, FIELD_AM)
            .stream()
            .collect(Collectors.toMap(g -> g.getId().getSalesEmpId(), g -> g.getGoalAmt() != null ? g.getGoalAmt() : 0L, (a, b) -> a));

        final Integer finalCompanyCd = companyCd;
        List<com.tara.crm.auth.entity.User> salesUsers = userRepository.findAllByCompanyCd(finalCompanyCd)
            .stream()
            .filter(u -> u.getRole() != Role.ADMIN && u.getRole() != Role.EXECUTIVE && u.getRole() != Role.STAFF && u.getStatus() == UserStatus.ACTIVE)
            .collect(Collectors.toList());

        if (salesUsers.isEmpty()) {
            return goalMap.entrySet().stream()
                .map(e -> {
                    String empNm = erpEmployeeRepository
                        .map(repo -> repo.findNameByEmpNo(e.getKey()))
                        .filter(n -> n != null && !n.isBlank())
                        .orElse(e.getKey());
                    return GoalDto.AmGoalItem.builder()
                        .salesEmpId(e.getKey()).empNm(empNm).goalAmt(e.getValue()).build();
                })
                .collect(Collectors.toList());
        }

        Map<Integer, String> deptMap = departmentRepository.findAllByCompanyCd(finalCompanyCd)
            .stream()
            .collect(Collectors.toMap(
                d -> d.getId().getDeptCd(),
                d -> Objects.toString(d.getDeptNm(), ""),
                (a, b) -> a));

        return salesUsers.stream()
            .map(u -> GoalDto.AmGoalItem.builder()
                .salesEmpId(u.getEmployeeNo())
                .empNm(u.getName())
                .deptNm(u.getDeptCd() != null ? deptMap.getOrDefault(u.getDeptCd(), "") : "")
                .goalAmt(goalMap.getOrDefault(u.getEmployeeNo(), 0L))
                .build())
            .collect(Collectors.toList());
    }

    /** AM 목표 일괄 upsert (단월) */
    @Transactional
    public void saveAmGoals(GoalDto.SaveAmGoalsRequest request) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = SecurityContextUtil.getCurrentPlantCd();
        if (companyCd == null) companyCd = 1000;
        if (plantCd == null) plantCd = 1000;

        if (request.getGoals() == null || request.getGoals().isEmpty()) return;

        for (GoalDto.AmGoalItem item : request.getGoals()) {
            GoalMstId id = new GoalMstId(companyCd, plantCd,
                request.getPlanYy(), request.getPlanMm(),
                "", item.getSalesEmpId(), FIELD_AM);
            GoalMst goal = goalMstRepository.findById(id)
                .orElseGet(() -> GoalMst.builder().id(id).build());
            goal.setGoalAmt(item.getGoalAmt());
            goalMstRepository.save(goal);
        }
    }

    /** AM 연간 목표 조회 (1~12월, 내부/외부 구분). 단일 deptCd 호출 호환. */
    public List<GoalDto.AmGoalYearlyItem> getAmGoalsYearly(String planYy, String deptCd, Integer requestedPlantCd, String salesEmpId) {
        List<String> deptCds = (deptCd != null && !deptCd.isBlank()) ? List.of(deptCd) : null;
        return getAmGoalsYearly(planYy, deptCds, requestedPlantCd, salesEmpId);
    }

    /** AM 연간 목표 조회 — deptCds N개 (시트 #5). */
    public List<GoalDto.AmGoalYearlyItem> getAmGoalsYearly(String planYy, List<String> deptCds, Integer requestedPlantCd, String salesEmpId) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = requestedPlantCd != null ? requestedPlantCd : SecurityContextUtil.getCurrentPlantCd();
        if (companyCd == null) companyCd = 1000;
        if (plantCd == null) plantCd = 1000;

        // 목표입력 권한: MANAGER/PART_LEADER/STAFF 는 본인 부서만 (요청 deptCds 무시, 서버 강제).
        final List<String> scopedDeptCds = applyDeptScope(deptCds);
        // STAFF 는 영업담당자가 아니므로 자기 목표 행은 목표입력에 노출 안 함(본인 사원번호 제외).
        final boolean staffSelfExclude = "STAFF".equals(SecurityContextUtil.getCurrentRole());
        final String myEmpNo = staffSelfExclude ? SecurityContextUtil.getCurrentEmployeeNo() : null;

        // 해당 연도 전체 AM 목표 데이터 (Map: empId_mm → GoalMst)
        final Integer finalCompanyCd = companyCd;
        final Integer finalPlantCd = plantCd;
        Map<String, GoalMst> goalMap = goalMstRepository
            .findByYearAndField(companyCd, plantCd, planYy, FIELD_AM)
            .stream()
            .collect(Collectors.toMap(
                g -> g.getId().getSalesEmpId() + "_" + g.getId().getPlanMm(),
                g -> g,
                (a, b) -> a
            ));

        // 부서명 맵 (deptCd Integer → deptNm) - Oracle 우선, MySQL fallback
        Map<Integer, String> deptMap;
        if (erpDepartmentRepository.isPresent()) {
            deptMap = erpDepartmentRepository.get().findAll().stream()
                .filter(d -> d.getDeptCd() != null && !d.getDeptCd().isBlank())
                .filter(d -> { try { Integer.parseInt(d.getDeptCd()); return true; } catch (NumberFormatException ignored) { return false; } })
                .collect(Collectors.toMap(
                    d -> Integer.parseInt(d.getDeptCd()),
                    d -> d.getDeptNm() != null ? d.getDeptNm() : "",
                    (a, b) -> a));
        } else {
            deptMap = departmentRepository.findAllByCompanyCd(finalCompanyCd)
                .stream()
                .collect(Collectors.toMap(
                    d -> d.getId().getDeptCd(),
                    d -> Objects.toString(d.getDeptNm(), ""),
                    (a, b) -> a));
        }

        List<String> months = IntStream.rangeClosed(1, 12)
            .mapToObj(m -> String.format("%02d", m))
            .collect(Collectors.toList());

        // 한영TFT는 현재 구성원이 없는 조직이므로 사원 조회 결과만으로는 부서목표 행이 생성되지 않는다.
        // 전체 조회 또는 한영TFT를 직접 선택한 경우에만 빈 부서 그룹을 추가한다.
        boolean includeHanyoungTft = (salesEmpId == null || salesEmpId.isBlank())
            && (scopedDeptCds == null || scopedDeptCds.isEmpty()
                || scopedDeptCds.stream().anyMatch(HANYOUNG_TFT_DEPT_CD::equals));

        // Oracle HR_EMP_MST 기준 직원 목록 (Oracle 사용 시 우선)
        if (erpEmployeeRepository.isPresent()) {
            // requestedPlantCd가 명시적으로 지정된 경우에만 PLANT_CD 필터 적용
            List<com.tara.crm.integration.erp.dto.ErpEmployeeDto> baseEmps =
                (requestedPlantCd != null && requestedPlantCd != 0)
                    ? erpEmployeeRepository.get().findAllActiveByPlant(String.valueOf(requestedPlantCd))
                    : erpEmployeeRepository.get().findAllActiveSalesOnly();
            List<com.tara.crm.integration.erp.dto.ErpEmployeeDto> oracleEmps =
                baseEmps.stream()
                    .filter(e -> {
                        if (scopedDeptCds == null || scopedDeptCds.isEmpty()) return true;
                        if (e.getDeptCd() == null || e.getDeptCd().isBlank()) return false;
                        for (String d : scopedDeptCds) {
                            if (d == null || d.isBlank()) continue;
                            try {
                                if (Integer.parseInt(d) == Integer.parseInt(e.getDeptCd())) return true;
                            } catch (NumberFormatException ex) {
                                if (d.equals(e.getDeptCd())) return true;
                            }
                        }
                        return false;
                    })
                    .filter(e -> salesEmpId == null || salesEmpId.isBlank() || salesEmpId.equals(e.getEmpNo()))
                    .filter(e -> !(staffSelfExclude && myEmpNo != null && myEmpNo.equals(e.getEmpNo())))
                    .collect(Collectors.toList());

            List<GoalDto.AmGoalYearlyItem> oracleResult = oracleEmps.stream()
                .map(e -> {
                    String empNm = e.getKorNm() != null && !e.getKorNm().isBlank() ? e.getKorNm() : e.getEmpNo();
                    Integer empDeptCd = null;
                    try { empDeptCd = e.getDeptCd() != null ? Integer.parseInt(e.getDeptCd()) : null; }
                    catch (NumberFormatException ignored) {}
                    String deptNm = empDeptCd != null ? deptMap.getOrDefault(empDeptCd, "") : "";

                    List<GoalDto.MonthGoal> monthGoals = months.stream()
                        .map(mm -> {
                            GoalMst g = goalMap.get(e.getEmpNo() + "_" + mm);
                            return GoalDto.MonthGoal.builder()
                                .planMm(mm)
                                .goalAmt(g != null && g.getGoalAmt() != null ? g.getGoalAmt() : 0L)
                                .innerAmt(g != null && g.getInnerAmt() != null ? g.getInnerAmt() : 0L)
                                .outerAmt(g != null && g.getOuterAmt() != null ? g.getOuterAmt() : 0L)
                                .build();
                        })
                        .collect(Collectors.toList());

                    return GoalDto.AmGoalYearlyItem.builder()
                        .salesEmpId(e.getEmpNo())
                        .empNm(empNm)
                        .deptCd(e.getDeptCd() != null ? e.getDeptCd() : "")
                        .deptNm(deptNm)
                        .months(monthGoals)
                        .partLeader("200".equals(e.getOdtyCd()))
                        .build();
                })
                .collect(Collectors.toList());
            return withDeptGoalRows(oracleResult, months, goalMap, deptMap, includeHanyoungTft);
        }

        // Oracle 미사용 시 MySQL fallback
        List<com.tara.crm.auth.entity.User> salesUsers = userRepository.findAllByCompanyCd(finalCompanyCd)
            .stream()
            .filter(u -> u.getRole() != Role.ADMIN && u.getRole() != Role.EXECUTIVE && u.getRole() != Role.STAFF && u.getStatus() == UserStatus.ACTIVE)
            .filter(u -> {
                if (scopedDeptCds == null || scopedDeptCds.isEmpty()) return true;
                if (u.getDeptCd() == null) return false;
                String userDept = String.valueOf(u.getDeptCd());
                return scopedDeptCds.stream().anyMatch(d -> d != null && !d.isBlank() && d.equals(userDept));
            })
            .filter(u -> salesEmpId == null || salesEmpId.isBlank() ||
                    salesEmpId.equals(u.getEmployeeNo()))
            .filter(u -> !(staffSelfExclude && myEmpNo != null && myEmpNo.equals(u.getEmployeeNo())))
            .collect(Collectors.toList());

        List<GoalDto.AmGoalYearlyItem> mysqlResult = salesUsers.stream()
            .map(u -> {
                Integer userDeptCd = u.getDeptCd();
                String deptNm = userDeptCd != null ? deptMap.getOrDefault(userDeptCd, "") : "";

                List<GoalDto.MonthGoal> monthGoals = months.stream()
                    .map(mm -> {
                        GoalMst g = goalMap.get(u.getEmployeeNo() + "_" + mm);
                        return GoalDto.MonthGoal.builder()
                            .planMm(mm)
                            .goalAmt(g != null && g.getGoalAmt() != null ? g.getGoalAmt() : 0L)
                            .innerAmt(g != null && g.getInnerAmt() != null ? g.getInnerAmt() : 0L)
                            .outerAmt(g != null && g.getOuterAmt() != null ? g.getOuterAmt() : 0L)
                            .build();
                    })
                    .collect(Collectors.toList());

                return GoalDto.AmGoalYearlyItem.builder()
                    .salesEmpId(u.getEmployeeNo())
                    .empNm(u.getName())
                    .deptCd(userDeptCd != null ? String.valueOf(userDeptCd) : "")
                    .deptNm(deptNm)
                    .months(monthGoals)
                    .partLeader(u.getRole() == Role.PART_LEADER)
                    .build();
            })
            .collect(Collectors.toList());
        return withDeptGoalRows(mysqlResult, months, goalMap, deptMap, includeHanyoungTft);
    }

    /** 시트 #5 0511_3 — 부서별 첫 행에 "ㅇㅇ목표"(salesEmpId="DEPT_{cd}") 가상 담당자 행을 끼워넣는다.
     *  부서 전체 목표 입력칸으로 사용. saveAmGoalsYearly 가 이 가상 ID 를 그대로 GoalMst 로 저장. */
    private List<GoalDto.AmGoalYearlyItem> withDeptGoalRows(
            List<GoalDto.AmGoalYearlyItem> items,
            List<String> months,
            Map<String, GoalMst> goalMap,
            Map<Integer, String> deptMap,
            boolean includeHanyoungTft) {
        java.util.LinkedHashMap<String, List<GoalDto.AmGoalYearlyItem>> grouped = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> deptNmMap = new java.util.LinkedHashMap<>();
        for (GoalDto.AmGoalYearlyItem it : items) {
            String key = it.getDeptCd() != null ? it.getDeptCd() : "";
            grouped.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(it);
            deptNmMap.putIfAbsent(key, it.getDeptNm() != null ? it.getDeptNm() : "");
        }
        if (includeHanyoungTft) {
            grouped.computeIfAbsent(HANYOUNG_TFT_DEPT_CD, k -> new java.util.ArrayList<>());
            deptNmMap.putIfAbsent(HANYOUNG_TFT_DEPT_CD,
                deptMap.getOrDefault(Integer.parseInt(HANYOUNG_TFT_DEPT_CD), "한영TFT"));
        }
        List<GoalDto.AmGoalYearlyItem> result = new java.util.ArrayList<>();
        for (Map.Entry<String, List<GoalDto.AmGoalYearlyItem>> entry : grouped.entrySet()) {
            String deptCd = entry.getKey();
            String deptNm = deptNmMap.get(deptCd);
            String virtualEmpId = "DEPT_" + (deptCd != null ? deptCd : "");
            List<GoalDto.MonthGoal> monthGoals = months.stream()
                .map(mm -> {
                    GoalMst g = goalMap.get(virtualEmpId + "_" + mm);
                    return GoalDto.MonthGoal.builder()
                        .planMm(mm)
                        .goalAmt(g != null && g.getGoalAmt() != null ? g.getGoalAmt() : 0L)
                        .innerAmt(g != null && g.getInnerAmt() != null ? g.getInnerAmt() : 0L)
                        .outerAmt(g != null && g.getOuterAmt() != null ? g.getOuterAmt() : 0L)
                        .build();
                })
                .collect(Collectors.toList());
            String safeDeptNm = (deptNm != null && !deptNm.isBlank()) ? deptNm : "부서";
            result.add(GoalDto.AmGoalYearlyItem.builder()
                .salesEmpId(virtualEmpId)
                .empNm(safeDeptNm + "목표")
                .deptCd(deptCd)
                .deptNm(deptNm)
                .months(monthGoals)
                .build());
            result.addAll(entry.getValue());
        }
        return result;
    }

    /** AM 연간 목표 저장 (내부/외부 분리) */
    @Transactional
    public void saveAmGoalsYearly(GoalDto.SaveAmGoalYearlyRequest request) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        // 요청에 plantCd가 있으면 우선 사용 (GET과 동일한 기준으로 저장)
        Integer plantCd = request.getPlantCd() != null
            ? request.getPlantCd()
            : SecurityContextUtil.getCurrentPlantCd();
        if (companyCd == null) companyCd = 1000;
        if (plantCd == null) plantCd = 1000;

        if (request.getGoals() == null) return;

        // 부서한정 역할(MANAGER/PART_LEADER/STAFF)은 본인 부서 건만 저장 — 다른 부서 저장 시도는 서버에서 차단.
        boolean deptScoped = DEPT_SCOPED_ROLES.contains(SecurityContextUtil.getCurrentRole());
        Integer ownDeptCd = deptScoped ? SecurityContextUtil.getCurrentDepartmentCd() : null;

        for (GoalDto.AmGoalYearlyItem item : request.getGoals()) {
            if (item.getMonths() == null) continue;
            String deptCdForKey = item.getDeptCd() != null ? item.getDeptCd() : "";
            // 부서한정 역할은 본인 부서 건만 통과(그 외 부서 항목은 무시).
            if (deptScoped && (ownDeptCd == null || !String.valueOf(ownDeptCd).equals(deptCdForKey))) continue;
            for (GoalDto.MonthGoal monthGoal : item.getMonths()) {
                GoalMstId id = new GoalMstId(companyCd, plantCd,
                    request.getPlanYy(), monthGoal.getPlanMm(),
                    deptCdForKey, item.getSalesEmpId(), FIELD_AM);
                GoalMst goal = goalMstRepository.findById(id)
                    .orElseGet(() -> GoalMst.builder().id(id).build());
                // 시트 #5 0511_2 — 입력은 goalAmt + innerAmt. outerAmt = max(0, goalAmt - innerAmt) 자동.
                long inner = monthGoal.getInnerAmt() != null ? monthGoal.getInnerAmt() : 0L;
                long goalA = monthGoal.getGoalAmt() != null ? monthGoal.getGoalAmt() : 0L;
                long outer = Math.max(0L, goalA - inner);
                goal.setGoalAmt(goalA);
                goal.setInnerAmt(inner);
                goal.setOuterAmt(outer);
                goalMstRepository.save(goal);
            }
        }
    }
}
