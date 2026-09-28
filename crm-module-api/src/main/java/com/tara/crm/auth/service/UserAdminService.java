package com.tara.crm.auth.service;

import com.tara.crm.auth.dto.UserAdminDto;
import com.tara.crm.auth.entity.Department;
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

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    public List<UserAdminDto.Item> list(String keyword, Integer deptCd, String role) {
        Map<Integer, String> deptNames = departmentRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (x, y) -> x));
        String kw = keyword == null ? null : keyword.trim().toLowerCase();

        return userRepository.findAllByCompanyCd(companyCd()).stream()
                .filter(u -> deptCd == null || Objects.equals(u.getDeptCd(), deptCd))
                .filter(u -> role == null || role.isBlank() || (u.getRole() != null && u.getRole().name().equals(role)))
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
                            .role(r)
                            .scopes(resourceScopeService.scopesOf(r))
                            .status(u.getStatus() == null ? null : u.getStatus().name())
                            .email(u.getEmail())
                            .phone(u.getPhone())
                            .mustChangePassword(Boolean.TRUE.equals(u.getMustChangePassword()))
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
        u.setRole(role);
        if (req.getDeptCd() != null) u.setDeptCd(req.getDeptCd());
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            try {
                u.setStatus(UserStatus.valueOf(req.getStatus()));
            } catch (Exception e) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 상태입니다: " + req.getStatus());
            }
        }
        userRepository.save(u);
        log.info("[user-admin] {} → role={} dept={} status={}", userId, role, u.getDeptCd(), u.getStatus());
    }

    private long countAdmins() {
        return userRepository.findAllByCompanyCd(companyCd()).stream()
                .filter(x -> x.getRole() == Role.ADMIN)
                .count();
    }
}
