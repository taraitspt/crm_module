package com.tara.crm.common.org;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 부서·비용센터 → 본부 (2026-10-19 사용자 요청 — 매출 화면 본부 조회 조건·본부별 집계).
 * 본부 = 부서 관리 조직도에서 회사 최상위(예: 90002 타라티피에스 — 하위 부서가 가장 많은 최상위) 바로 아래 부서
 * (국내사업본부 1200 · 해외사업본부 1500 · 전략사업본부 1400 …). 팀 → 본부는 상위 부서를 따라 올라가 찾는다.
 * 회사 트리 밖에 따로 떨어진 최상위(예: 90001 그래픽스사업본부, 2050 경영지원실)는 그 최상위 자체가 본부다
 * — 그래픽스 BS2팀·BS3팀이 본부로 잡히던 문제(2026-10-19).
 * 조직도는 부서 관리 화면에서 바뀌므로 호출할 때마다 departments 를 새로 읽는다(작은 표).
 */
@Component
@RequiredArgsConstructor
public class HqResolver {

    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;

    /** 본부 — sort 는 조직도 순서(부서 관리의 같은 상위 안 순서, 없으면 부서코드) */
    public record Hq(Integer cd, String nm, int sort) {}

    /** 한 번의 조회(요청) 안에서 쓰는 변환표 */
    public final class Lookup {
        private final Map<Integer, Department> depts = new HashMap<>();
        private final Map<String, Integer> deptByCc = new HashMap<>();
        private final Map<String, Integer> deptByEmpNo = new HashMap<>();
        private final Map<Integer, Hq> cache = new HashMap<>();
        /** 회사 최상위 — 하위 부서가 가장 많은 최상위 */
        private Integer companyRoot;

        private Lookup(List<Department> all, List<User> users) {
            for (Department d : all) depts.put(d.getId().getDeptCd(), d);
            // 같은 비용센터를 쓰는 부서가 여럿이면 사용 중인 부서를 먼저
            for (Department d : all) {
                if (d.getCcCd() == null || d.getCcCd().isBlank()) continue;
                String cc = d.getCcCd().trim();
                Integer cur = deptByCc.get(cc);
                if (cur == null || (!"Y".equals(depts.get(cur).getUseYn()) && "Y".equals(d.getUseYn()))) {
                    deptByCc.put(cc, d.getId().getDeptCd());
                }
            }
            for (User u : users) {
                if (u.getEmployeeNo() != null && u.getDeptCd() != null) deptByEmpNo.putIfAbsent(u.getEmployeeNo().trim(), u.getDeptCd());
            }
            Map<Integer, Integer> size = new HashMap<>();
            for (Department d : all) {
                Integer root = rootOf(d.getId().getDeptCd());
                if (root != null) size.merge(root, 1, Integer::sum);
            }
            companyRoot = size.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null);
            // departments.cc_cd 가 비어 있는 경우가 많아(2026-10 운영 전부 NULL) 사용자 비용센터로 보완 —
            // 그 비용센터를 쓰는 재직 사용자가 가장 많은 부서(같으면 부서코드 작은 쪽)
            Map<String, Map<Integer, Integer>> cnt = new HashMap<>();
            for (User u : users) {
                if (u.getCcCd() == null || u.getCcCd().isBlank() || u.getDeptCd() == null || !u.isActive()) continue;
                cnt.computeIfAbsent(u.getCcCd().trim(), k -> new HashMap<>()).merge(u.getDeptCd(), 1, Integer::sum);
            }
            cnt.forEach((cc, byDept) -> {
                if (deptByCc.containsKey(cc)) return;
                byDept.entrySet().stream()
                        .max(java.util.Map.Entry.<Integer, Integer>comparingByValue().thenComparing(e -> -e.getKey()))
                        .ifPresent(e -> deptByCc.put(cc, e.getKey()));
            });
        }

        /** 위로 올라가 만나는 최상위(상위가 없거나 조직도에 없는 부서) */
        private Integer rootOf(Integer deptCd) {
            Integer cur = deptCd;
            for (int guard = 0; cur != null && guard < 30; guard++) {
                Department d = depts.get(cur);
                if (d == null) return null;
                if (d.getUpDeptCd() == null || !depts.containsKey(d.getUpDeptCd())) return cur;
                cur = d.getUpDeptCd();
            }
            return null;
        }

        private Hq hqOf(Department d, int base) {
            return new Hq(d.getId().getDeptCd(), d.getDeptNm(), base + (d.getSortOrder() != null ? d.getSortOrder() : d.getId().getDeptCd()));
        }

        /** 부서 → 본부. 회사 최상위 자체거나 조직도에 없으면 null */
        public Hq ofDept(Integer deptCd) {
            if (deptCd == null) return null;
            if (cache.containsKey(deptCd)) return cache.get(deptCd);
            Hq hq = null;
            Integer root = rootOf(deptCd);
            if (root != null && !root.equals(companyRoot)) {
                hq = hqOf(depts.get(root), 100_000);               // 회사 트리 밖 최상위 = 그 자체가 본부(회사 본부들 뒤)
            } else if (root != null && !root.equals(deptCd)) {
                Integer cur = deptCd;
                for (int guard = 0; cur != null && guard < 30; guard++) {
                    Department d = depts.get(cur);
                    if (root.equals(d.getUpDeptCd())) { hq = hqOf(d, 0); break; }
                    cur = d.getUpDeptCd();
                }
            }
            cache.put(deptCd, hq);
            return hq;
        }

        /** 비용센터(ERP 매출 라인 CC_CD) → 본부. 비용센터로 못 찾으면 영업담당 사번의 CRM 부서로 */
        public Hq ofCc(String ccCd, String empNo) {
            Integer dept = ccCd == null || ccCd.isBlank() ? null : deptByCc.get(ccCd.trim());
            if (dept == null && empNo != null && !empNo.isBlank()) dept = deptByEmpNo.get(empNo.trim());
            return ofDept(dept);
        }

        /** 부서코드 문자열(ERP 부서코드 = CRM dept_cd) → 본부, 못 찾으면 비용센터·사번으로 */
        public Hq ofDeptStr(String deptCd, String ccCd, String empNo) {
            Hq hq = null;
            if (deptCd != null && !deptCd.isBlank()) {
                try { hq = ofDept(Integer.parseInt(deptCd.trim())); } catch (NumberFormatException ignore) { /* 숫자 아님 */ }
            }
            return hq != null ? hq : ofCc(ccCd, empNo);
        }
    }

    public Lookup lookup() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        int companyCd = c != null ? c : 1000;
        return new Lookup(departmentRepository.findAllByCompanyCd(companyCd), userRepository.findAllByCompanyCd(companyCd));
    }
}
