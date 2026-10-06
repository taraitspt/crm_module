package com.tara.crm.auth.service;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.JobTitle;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.entity.UserStatus;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.id.DepartmentId;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 부서 관리 — 상위 부서(조직도)와 부서장(본부장·팀장) 지정, 부서 직접 추가·이름 변경·삭제(직접 추가한 것만), 사용/미사용(V25).
 * ERP MA_DEPT_MST.UP_DEPT_CD 가 비어 있는 부서를 관리자가 직접 잇는다. HRM(인사평가) 부서 관리를 그대로 이식(2026-10-06, V155).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DepartmentAdminService {

    private final DepartmentRepository departmentRepository;
    private final UserRepository userRepository;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    /** 부서 목록 + 인원수 + 상위 부서 이름. 트리는 화면에서 upDeptCd 로 만든다. */
    public List<Map<String, Object>> list() {
        List<Department> depts = departmentRepository.findAllByCompanyCd(companyCd());
        Map<Integer, String> names = depts.stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (a, b) -> a));
        List<User> users = userRepository.findAllByCompanyCd(companyCd());
        Map<Integer, Long> headcount = users.stream()
                .filter(u -> u.getDeptCd() != null && u.getStatus() == UserStatus.ACTIVE)
                .collect(Collectors.groupingBy(u -> u.getDeptCd(), Collectors.counting()));
        Map<String, User> byEmpNo = users.stream().filter(u -> u.getEmployeeNo() != null)
                .collect(Collectors.toMap(User::getEmployeeNo, u -> u, (a, b) -> a));
        // 소속 재직자 명단 — 인원 숫자를 누르면 보인다. 직책 높은 순 → 이름순
        Map<Integer, List<Map<String, Object>>> membersByDept = users.stream()
                .filter(u -> u.getDeptCd() != null && u.getStatus() == UserStatus.ACTIVE)
                // JobTitle.ALL 은 List.of(...) 라 indexOf(null) 이 NPE — 직책 없는 사용자는 맨 뒤(2026-10-06 부서 관리 화면이 비어 보이던 원인)
                .sorted(Comparator.comparingInt((User u) -> -Math.max(0, u.getJobTitle() == null ? -1 : JobTitle.ALL.indexOf(u.getJobTitle())))
                        .thenComparing(User::getName, Comparator.nullsLast(Comparator.naturalOrder())))
                .collect(Collectors.groupingBy(User::getDeptCd, LinkedHashMap::new, Collectors.mapping(u -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("employeeNo", u.getEmployeeNo());
                    m.put("name", u.getName());
                    m.put("jobTitle", u.getJobTitle() == null ? JobTitle.MANAGER : u.getJobTitle());
                    return m;
                }, Collectors.toList())));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Department d : depts) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("deptCd", d.getId().getDeptCd());
            m.put("deptNm", d.getDeptNm());
            m.put("upDeptCd", d.getUpDeptCd());
            m.put("upDeptNm", d.getUpDeptCd() == null ? null : names.get(d.getUpDeptCd()));
            m.put("headcount", headcount.getOrDefault(d.getId().getDeptCd(), 0L));
            User head = d.getHeadEmployeeNo() == null ? null : byEmpNo.get(d.getHeadEmployeeNo());
            m.put("headEmployeeNo", d.getHeadEmployeeNo());
            m.put("headName", head == null ? null : head.getName() + " " + (head.getJobTitle() == null ? "" : head.getJobTitle()).trim());
            m.put("inUse", d.isInUse());
            m.put("manual", d.isManual());
            m.put("sortOrder", d.getSortOrder());
            m.put("members", membersByDept.getOrDefault(d.getId().getDeptCd(), List.of()));
            out.add(m);
        }
        return out;
    }

    /** 직접 추가한 부서 번호 — ERP 부서 코드(4자리)와 겹치지 않게 90001 부터 */
    private static final int MANUAL_DEPT_CD_START = 90001;

    /**
     * 부서 직접 추가 — ERP 에 없는 묶음(예: 본부 노드)을 조직도에 넣는다. 사람은 ERP 동기화가 매일 ERP 부서로 되돌리므로
     * 여기 넣는 부서는 하위 부서를 묶고 부서장을 두는 용도다.
     */
    @Transactional
    public Integer create(String deptNm, Integer upDeptCd, String headEmployeeNo) {
        String name = deptNm == null ? "" : deptNm.trim();
        if (name.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "부서명을 입력하세요.");
        List<Department> all = departmentRepository.findAllByCompanyCd(companyCd());
        boolean dup = all.stream().anyMatch(x -> x.isInUse() && name.equals(x.getDeptNm()));
        if (dup) throw new BusinessException(ErrorCode.INVALID_INPUT, "같은 이름의 부서가 이미 있습니다: " + name);
        if (upDeptCd != null) requireUsableParent(upDeptCd);
        int deptCd = all.stream().mapToInt(x -> x.getId().getDeptCd())
                .filter(cd -> cd >= MANUAL_DEPT_CD_START).max().orElse(MANUAL_DEPT_CD_START - 1) + 1;
        Department d = Department.builder()
                .id(new DepartmentId(companyCd(), deptCd))
                .deptNm(name)
                .upDeptCd(upDeptCd)
                .useYn("Y")
                .build();
        departmentRepository.save(d);
        if (headEmployeeNo != null && !headEmployeeNo.isBlank()) setHead(deptCd, headEmployeeNo);
        log.info("[dept-admin] 부서 추가 {} {} (상위 {}) by {}", deptCd, name, upDeptCd, SecurityContextUtil.getCurrentUserId());
        return deptCd;
    }

    /** 이름 변경 — 직접 추가한 부서만. ERP 부서는 매일 동기화가 ERP 이름으로 되돌린다 */
    @Transactional
    public void rename(Integer deptCd, String deptNm) {
        Department d = require(deptCd);
        if (!d.isManual()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "ERP 부서의 이름은 ERP 에서 바꿉니다(여기서 바꿔도 매일 동기화가 되돌립니다).");
        }
        String name = deptNm == null ? "" : deptNm.trim();
        if (name.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "부서명을 입력하세요.");
        d.setDeptNm(name);
        departmentRepository.save(d);
        log.info("[dept-admin] {} 이름 → {} by {}", deptCd, name, SecurityContextUtil.getCurrentUserId());
    }

    /**
     * 사용 / 미사용 — 여러 부서를 한 번에. 미사용은 재직자가 없고, 사용 중인 하위 부서가 없어야 한다
     * (같이 미사용으로 바꾸는 하위 부서는 괜찮다). 막힌 부서는 건너뛰고 사유를 돌려준다.
     */
    @Transactional
    public Map<String, Object> setInUse(List<Integer> deptCds, boolean inUse) {
        if (deptCds == null || deptCds.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "부서를 고르세요.");
        Set<Integer> targets = new LinkedHashSet<>(deptCds);
        List<Department> all = departmentRepository.findAllByCompanyCd(companyCd());
        Map<Integer, Long> active = activeHeadcount();
        List<String> skipped = new ArrayList<>();
        int changed = 0;
        for (Integer cd : targets) {
            Department d = all.stream().filter(x -> x.getId().getDeptCd().equals(cd)).findFirst().orElse(null);
            if (d == null) { skipped.add(cd + ": 부서를 찾을 수 없음"); continue; }
            if (d.isInUse() == inUse) continue;
            if (!inUse) {
                long n = active.getOrDefault(cd, 0L);
                if (n > 0) { skipped.add(d.getDeptNm() + ": 재직자 " + n + "명 (사용자 관리에서 부서를 옮긴 뒤)"); continue; }
                List<String> liveChildren = all.stream()
                        .filter(x -> cd.equals(x.getUpDeptCd()) && x.isInUse() && !targets.contains(x.getId().getDeptCd()))
                        .map(Department::getDeptNm).toList();
                if (!liveChildren.isEmpty()) {
                    skipped.add(d.getDeptNm() + ": 사용 중인 하위 부서 " + String.join(", ", liveChildren) + " (먼저 옮기거나 같이 미사용으로)");
                    continue;
                }
            } else if (d.getUpDeptCd() != null) {
                Department parent = all.stream().filter(x -> x.getId().getDeptCd().equals(d.getUpDeptCd())).findFirst().orElse(null);
                if (parent != null && !parent.isInUse() && !targets.contains(parent.getId().getDeptCd())) {
                    skipped.add(d.getDeptNm() + ": 상위 부서 " + parent.getDeptNm() + "이(가) 미사용 (상위 부서를 먼저 다시 사용으로)");
                    continue;
                }
            }
            d.setInUse(inUse);
            departmentRepository.save(d);
            changed++;
        }
        log.info("[dept-admin] {} → {} ({}건, 건너뜀 {}) by {}", targets, inUse ? "사용" : "미사용", changed, skipped.size(), SecurityContextUtil.getCurrentUserId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("changed", changed);
        out.put("skipped", skipped);
        return out;
    }

    /**
     * 여러 부서를 한 상위 부서 아래로 — 체크해서 한 번에 옮기기, 또는 어떤 부서 아래로 기존 부서 가져오기.
     * 부서마다 setParent 와 같은 검사(순환·미사용 상위)를 하고, 막힌 부서는 건너뛰고 사유를 돌려준다.
     */
    @Transactional
    public Map<String, Object> moveAll(List<Integer> deptCds, Integer upDeptCd) {
        if (deptCds == null || deptCds.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "옮길 부서를 고르세요.");
        if (upDeptCd != null) requireUsableParent(upDeptCd);
        List<String> skipped = new ArrayList<>();
        int changed = 0;
        for (Integer cd : new LinkedHashSet<>(deptCds)) {
            Department d = departmentRepository.findById(new DepartmentId(companyCd(), cd)).orElse(null);
            if (d == null) { skipped.add(cd + ": 부서를 찾을 수 없음"); continue; }
            if (Objects.equals(d.getUpDeptCd(), upDeptCd)) continue;
            if (!d.isInUse()) { skipped.add(d.getDeptNm() + ": 미사용 부서 (먼저 다시 사용으로)"); continue; }
            try {
                setParent(cd, upDeptCd); // 같은 트랜잭션 — 앞에서 옮긴 결과를 보고 순환을 검사한다
                changed++;
            } catch (BusinessException e) {
                skipped.add(d.getDeptNm() + ": " + e.getMessage());
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("changed", changed);
        out.put("skipped", skipped);
        return out;
    }

    /** 삭제 — 직접 추가한 부서만, 소속 인원(퇴직 포함)·하위 부서가 없을 때. ERP 부서는 미사용으로 둔다(지워도 동기화가 다시 만든다) */
    @Transactional
    public void delete(Integer deptCd) {
        Department d = require(deptCd);
        if (!d.isManual()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "ERP 부서는 지울 수 없습니다 — 미사용으로 두세요(지워도 매일 동기화가 다시 만듭니다).");
        }
        boolean hasPeople = userRepository.findAllByCompanyCd(companyCd()).stream().anyMatch(u -> deptCd.equals(u.getDeptCd()));
        if (hasPeople) throw new BusinessException(ErrorCode.INVALID_INPUT, d.getDeptNm() + "에 소속된 사람이 있어 지울 수 없습니다.");
        List<Department> children = departmentRepository.findByUpDeptCd(companyCd(), deptCd);
        if (!children.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "하위 부서가 있어 지울 수 없습니다: "
                    + children.stream().map(Department::getDeptNm).collect(Collectors.joining(", ")));
        }
        departmentRepository.delete(d);
        log.info("[dept-admin] 부서 삭제 {} {} by {}", deptCd, d.getDeptNm(), SecurityContextUtil.getCurrentUserId());
    }

    private Department require(Integer deptCd) {
        return departmentRepository.findById(new DepartmentId(companyCd(), deptCd))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "부서를 찾을 수 없습니다: " + deptCd));
    }

    /** 상위 부서로 쓸 수 있는지 — 있어야 하고 사용 중이어야 한다 */
    private Department requireUsableParent(Integer upDeptCd) {
        Department p = departmentRepository.findById(new DepartmentId(companyCd(), upDeptCd))
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "상위 부서를 찾을 수 없습니다: " + upDeptCd));
        if (!p.isInUse()) throw new BusinessException(ErrorCode.INVALID_INPUT, p.getDeptNm() + "은(는) 미사용 부서라 상위 부서로 둘 수 없습니다.");
        return p;
    }

    private Map<Integer, Long> activeHeadcount() {
        return userRepository.findAllByCompanyCd(companyCd()).stream()
                .filter(u -> u.getDeptCd() != null && u.getStatus() == UserStatus.ACTIVE)
                .collect(Collectors.groupingBy(User::getDeptCd, Collectors.counting()));
    }

    /** 부서장 지정 — 사번이 비면 해제. 재직 중인 사람만 */
    @Transactional
    public void setHead(Integer deptCd, String employeeNo) {
        Department d = departmentRepository.findById(new DepartmentId(companyCd(), deptCd))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "부서를 찾을 수 없습니다: " + deptCd));
        if (employeeNo != null && !employeeNo.isBlank()) {
            User u = userRepository.findByCompanyCdAndEmployeeNo(companyCd(), employeeNo.trim())
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "사번을 찾을 수 없습니다: " + employeeNo));
            if (u.getStatus() != UserStatus.ACTIVE) throw new BusinessException(ErrorCode.INVALID_INPUT, u.getName() + "은(는) 미사용(퇴직) 계정이라 부서장으로 둘 수 없습니다.");
        }
        d.setHeadEmployeeNo(employeeNo);
        departmentRepository.save(d);
        log.info("[dept-admin] {} 부서장 → {} by {}", deptCd, d.getHeadEmployeeNo(), SecurityContextUtil.getCurrentUserId());
    }

    /** 상위 부서 지정. null 이면 최상위로. 자기 자신·순환(내 하위를 상위로) 은 거부. */
    @Transactional
    public void setParent(Integer deptCd, Integer upDeptCd) {
        Department d = departmentRepository.findById(new DepartmentId(companyCd(), deptCd))
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "부서를 찾을 수 없습니다: " + deptCd));
        if (upDeptCd != null) {
            if (upDeptCd.equals(deptCd)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "자기 자신을 상위 부서로 둘 수 없습니다.");
            }
            requireUsableParent(upDeptCd);
            // 순환 검사: 새 상위 부서에서 위로 올라가다 나 자신이 나오면 고리가 된다.
            Map<Integer, Integer> parentOf = departmentRepository.findAllByCompanyCd(companyCd()).stream()
                    .filter(x -> x.getUpDeptCd() != null)
                    .collect(Collectors.toMap(x -> x.getId().getDeptCd(), Department::getUpDeptCd, (a, b) -> a));
            Integer cur = upDeptCd;
            int guard = 0;
            while (cur != null && guard++ < 100) {
                if (cur.equals(deptCd)) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT, "하위 부서를 상위 부서로 둘 수 없습니다(순환).");
                }
                cur = parentOf.get(cur);
            }
        }
        // 자리를 옮기면 예전 자리의 순서는 의미가 없다 — 비워서 새 자리의 맨 뒤로
        if (!Objects.equals(d.getUpDeptCd(), upDeptCd)) d.setSortOrder(null);
        d.setUpDeptCd(upDeptCd);
        departmentRepository.save(d);
        log.info("[dept-admin] {} 상위 부서 → {} by {}", deptCd, upDeptCd, SecurityContextUtil.getCurrentUserId());
    }

    /**
     * 표시 순서 — 같은 상위 부서 안의 부서들을 화면이 보낸 순서대로 10, 20, 30… 으로 매긴다(끌어다 놓기).
     * 상위 부서가 다른 부서가 섞여 있으면 거부한다(다른 자리로 옮기는 건 setParent/moveAll).
     */
    @Transactional
    public void reorder(List<Integer> deptCds) {
        if (deptCds == null || deptCds.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "순서를 정할 부서가 없습니다.");
        List<Department> list = new ArrayList<>();
        for (Integer cd : new LinkedHashSet<>(deptCds)) list.add(require(cd));
        long parents = list.stream().map(d -> Objects.requireNonNullElse(d.getUpDeptCd(), 0)).distinct().count();
        if (parents > 1) throw new BusinessException(ErrorCode.INVALID_INPUT, "같은 상위 부서 안에서만 순서를 바꿀 수 있습니다.");
        for (int i = 0; i < list.size(); i++) {
            list.get(i).setSortOrder((i + 1) * 10);
            departmentRepository.save(list.get(i));
        }
        log.info("[dept-admin] 순서 {} by {}", deptCds, SecurityContextUtil.getCurrentUserId());
    }
}
