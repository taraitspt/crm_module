package com.tara.crm.common.util;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.repository.DepartmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class RoleFilterHelper {

    private final DepartmentRepository departmentRepository;

    /**
     * 현재 사용자가 접근 가능한 부서 코드(dept_cd) 목록을 반환한다.
     * - ADMIN: null (필터 없음 = 전체 데이터)
     * - MANAGER: 본인 부서 + 하위 부서
     * - STAFF: 본인 부서만
     */
    public List<Integer> getAccessibleDepartmentCds() {
        String role = SecurityContextUtil.getCurrentRole();
        Integer deptCd = SecurityContextUtil.getCurrentDepartmentCd();

        // SALES_SPT(영업지원)는 부서 제한 없이 전체 조회 — getOrderAccessibleDepartmentCds 와 동일 취급.
        // (생산/외주 부서 사람을 SALES_SPT 로 두어 데이터분석 전체를 보게 하는 용도)
        if ("ADMIN".equals(role) || "MANAGER".equals(role) || "SALES_SPT".equals(role)
                || "CENTER_LEADER".equals(role)) {
            return null; // 전체 데이터 접근
        }

        if (deptCd == null) {
            return List.of(-1);
        }

        if ("PART_LEADER".equals(role)) {
            Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
            List<Integer> codes = new ArrayList<>();
            codes.add(deptCd);
            List<Department> children = departmentRepository.findByUpDeptCd(companyCd != null ? companyCd : 1000, deptCd);
            for (Department child : children) {
                codes.add(child.getId().getDeptCd());
            }
            return codes;
        }

        // STAFF
        return List.of(deptCd);
    }

    /**
     * 대시보드(메인/통합실적) 전용 접근 가능 부서.
     * - 전체(null): ADMIN / EXECUTIVE / FINANCE / SALES_SPT / TEAM_LEADER
     * - 그 외(MANAGER / STAFF / PART_LEADER): 본인 부서 + 하위 부서
     */
    public List<Integer> getDashboardAccessibleDepartmentCds() {
        String role = SecurityContextUtil.getCurrentRole();
        if ("ADMIN".equals(role) || "EXECUTIVE".equals(role) || "FINANCE".equals(role)
                || "SALES_SPT".equals(role) || "CENTER_LEADER".equals(role) || "TEAM_LEADER".equals(role)) {
            return null; // 전체 데이터 접근
        }
        Integer deptCd = SecurityContextUtil.getCurrentDepartmentCd();
        if (deptCd == null) {
            return List.of(-1); // 부서한정인데 부서 미지정 → 빈 결과
        }
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        return collectDeptWithDescendants(companyCd != null ? companyCd : 1000, deptCd);
    }

    /** 주어진 부서 + 그 하위(자식·손자…) 부서 dept_cd 를 모두 수집. */
    private List<Integer> collectDeptWithDescendants(int companyCd, int rootDeptCd) {
        List<Integer> result = new ArrayList<>();
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        java.util.Deque<Integer> queue = new java.util.ArrayDeque<>();
        queue.add(rootDeptCd);
        while (!queue.isEmpty()) {
            Integer cd = queue.poll();
            if (!seen.add(cd)) continue;
            result.add(cd);
            for (Department child : departmentRepository.findByUpDeptCd(companyCd, cd)) {
                queue.add(child.getId().getDeptCd());
            }
        }
        return result;
    }

    /**
     * 주문목록 전용 접근 가능 부서(영업담당부서 기준). (기존 {@link #getAccessibleDepartmentCds()} 와 규칙이 다름)
     * - PART_LEADER / MANAGER / STAFF: <b>본인 부서(파트)만</b> — 하위 미포함(팀 소속이라도 그 팀 하위 파트 전체를 보진 않음)
     * - 그 외(ADMIN / EXECUTIVE / TEAM_LEADER / FINANCE / SALES_SPT): null (전체, 권한 제한 없음)
     */
    public List<Integer> getOrderAccessibleDepartmentCds() {
        String role = SecurityContextUtil.getCurrentRole();
        boolean deptScoped = "PART_LEADER".equals(role) || "MANAGER".equals(role) || "STAFF".equals(role);
        if (!deptScoped) {
            return null; // 전체 데이터 접근
        }

        Integer deptCd = SecurityContextUtil.getCurrentDepartmentCd();
        if (deptCd == null) {
            return List.of(-1); // 부서한정인데 부서 미지정 → 빈 결과
        }

        // 본인 부서(파트)만. 하위 부서 확장 없음.
        return List.of(deptCd);
    }

    /**
     * 데이터분석 AM실적(getAmDashboard) 전용 부서 스코프.
     * - MANAGER(영업매니저): <b>본인 부서(파트)만</b> — 본인파트 소속 AM 실적만 노출.
     * - 그 외(PART_LEADER 포함 전 role): null (전체, 현행 유지 — 변경 없음).
     */
    public List<Integer> getAmDashboardAccessibleDepartmentCds() {
        String role = SecurityContextUtil.getCurrentRole();
        if (!"MANAGER".equals(role)) {
            return null; // 전체 — PART_LEADER 등은 현행 유지
        }
        Integer deptCd = SecurityContextUtil.getCurrentDepartmentCd();
        if (deptCd == null) {
            return List.of(-1); // 부서 미지정 → 빈 결과
        }
        return List.of(deptCd); // 본인 부서(파트)만
    }
}
