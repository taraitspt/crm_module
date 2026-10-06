package com.tara.crm.auth.service;

import com.tara.crm.auth.dto.UserAdminDto;
import com.tara.crm.auth.entity.AuthEventType;
import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.JobTitle;
import com.tara.crm.auth.entity.Role;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.entity.UserStatus;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.menu.ResourceScopeService;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/** 사용자 관리 — 역할·부서·상태 변경. 누가 팀장인지 여기서 정한다. */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserAdminService {

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final ResourceScopeService resourceScopeService;
    private final AuthHistoryService authHistoryService;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    public List<UserAdminDto.Item> list(String keyword, Integer deptCd, String role, String status) {
        Map<Integer, String> deptNames = departmentRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (x, y) -> x));
        String kw = keyword == null ? null : keyword.trim().toLowerCase();

        return userRepository.findAllByCompanyCd(companyCd()).stream()
                .filter(u -> deptCd == null || Objects.equals(u.getDeptCd(), deptCd))
                .filter(u -> role == null || role.isBlank() || (u.getRole() != null && u.getRole().name().equals(role)))
                .filter(u -> status == null || status.isBlank() || (u.getStatus() != null && u.getStatus().name().equals(status)))
                .filter(u -> kw == null || kw.isEmpty()
                        || (u.getName() != null && u.getName().toLowerCase().contains(kw))
                        || u.getId().getId().toLowerCase().contains(kw)
                        || (u.getEmployeeNo() != null && u.getEmployeeNo().toLowerCase().contains(kw)))
                .sorted(Comparator.comparing((User u) -> u.getDeptCd() == null ? Integer.MAX_VALUE : u.getDeptCd())
                        .thenComparing(u -> u.getName() == null ? "" : u.getName()))
                .map(u -> {
                    String r = u.getRole() == null ? null : u.getRole().name();
                    return UserAdminDto.Item.builder()
                            .id(u.getId().getId())
                            .employeeNo(u.getEmployeeNo())
                            .name(u.getName())
                            .deptCd(u.getDeptCd())
                            .deptNm(u.getDeptCd() == null ? null : deptNames.get(u.getDeptCd()))
                            .jobTitle(u.getJobTitle())
                            .role(r)
                            .scopes(resourceScopeService.scopesOf(r))
                            .status(u.getStatus() == null ? null : u.getStatus().name())
                            .email(u.getEmail())
                            .phone(u.getPhone())
                            .mustChangePassword(Boolean.TRUE.equals(u.getMustChangePassword()))
                            .failedLoginCount(u.getFailedLoginCount() == null ? 0 : u.getFailedLoginCount())
                            .lockedUntil(u.getLockedUntil())
                            .locked(u.isLockedNow())
                            .build();
                })
                .toList();
    }

    @Transactional
    public void update(String userId, UserAdminDto.UpdateRequest req) {
        User u = userRepository.findByCompanyCdAndUserId(companyCd(), userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        Role role;
        try {
            role = Role.valueOf(req.getRole());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 역할입니다: " + req.getRole());
        }
        // 마지막 관리자를 강등하면 아무도 권한 화면에 들어갈 수 없게 된다.
        if (u.getRole() == Role.ADMIN && role != Role.ADMIN && countAdmins() <= 1) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "마지막 관리자의 역할은 바꿀 수 없습니다.");
        }
        if (req.getDeptCd() != null) u.setDeptCd(req.getDeptCd());
        // 직책은 관리자만 바꾼다(본인 프로필에선 못 바꿈) — ERP 동기화는 비어 있을 때만 채운다.
        // CRM 은 역할을 직책에 묶지 않는다: 직책을 바꿔도 역할은 화면에서 고른 값 그대로(2026-10-06 사용자 결정).
        if (req.getJobTitle() != null && !req.getJobTitle().isBlank()) {
            if (!JobTitle.isValid(req.getJobTitle())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 직책입니다: " + req.getJobTitle());
            }
            u.setJobTitle(req.getJobTitle());
        }
        u.setRole(role);
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            try {
                u.setStatus(UserStatus.valueOf(req.getStatus()));
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 상태입니다: " + req.getStatus());
            }
        }
        userRepository.save(u);
        log.info("[user-admin] {} → role={} dept={} title={} status={}", userId, role, u.getDeptCd(), u.getJobTitle(), u.getStatus());
    }

    /** 잠긴 계정을 풀어 준다. 실패 카운터도 같이 0 으로. 이력에 UNLOCKED 로 남긴다. */
    @Transactional
    public void unlock(String userId) {
        User u = userRepository.findByCompanyCdAndUserId(companyCd(), userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        u.clearLoginFailures();
        userRepository.save(u);
        authHistoryService.record(u, AuthEventType.UNLOCKED);
        log.info("[user-admin] {} 잠금 해제 by {}", userId, SecurityContextUtil.getCurrentUserId());
    }

    /**
     * 여러 명을 한 번에 재직 ↔ 미사용(퇴직) — ERP 에서 같이 딸려 온 옛 계정을 정리할 때(2026-10-06).
     * 미사용(INACTIVE)은 로그인이 막힌다. 지우지 않는 이유: ERP 에 재직으로 남아 있는 사람은 동기화가 다시 만들기 때문이다
     * (동기화는 상태를 건드리지 않으니 미사용은 그대로 유지된다). 반환 = 실제로 바뀐 인원 수.
     */
    @Transactional
    public int bulkStatus(List<String> userIds, String status) {
        UserStatus target;
        try {
            target = UserStatus.valueOf(status);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 상태입니다: " + status);
        }
        if (userIds == null || userIds.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "바꿀 사용자를 선택해주세요.");
        String me = SecurityContextUtil.getCurrentUserId();
        int changed = 0;
        for (String id : new java.util.LinkedHashSet<>(userIds)) {
            User u = userRepository.findByCompanyCdAndUserId(companyCd(), id).orElse(null);
            if (u == null || u.getStatus() == target) continue;
            if (target == UserStatus.INACTIVE) {
                if (id.equals(me)) throw new BusinessException(ErrorCode.INVALID_INPUT, "지금 로그인한 본인 계정은 미사용으로 바꿀 수 없습니다.");
                if (u.getRole() == Role.ADMIN) throw new BusinessException(ErrorCode.INVALID_INPUT, u.getName() + "(" + id + ")은(는) 시스템 관리자라 미사용으로 바꿀 수 없습니다. 역할부터 바꾸세요.");
            }
            u.setStatus(target);
            userRepository.save(u);
            changed++;
        }
        log.info("[user-admin] 상태 일괄 변경 → {} {}명 by {}", target, changed, me);
        return changed;
    }

    private long countAdmins() {
        return userRepository.findAllByCompanyCd(companyCd()).stream()
                .filter(x -> x.getRole() == Role.ADMIN)
                .count();
    }
}
