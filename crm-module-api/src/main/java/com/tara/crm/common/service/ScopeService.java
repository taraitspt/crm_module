package com.tara.crm.common.service;

import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.menu.CrmResource;
import com.tara.crm.common.menu.ResourceScopeService;
import com.tara.crm.common.util.DataScope;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;

/**
 * 로그인 사용자가 볼 수 있는 영업담당자 집합을 계산한다.
 * 영업활동·영업기회·월매출계획·매출현황이 모두 이걸 거쳐 범위를 좁힌다.
 *
 * 범위는 역할이 아니라 (리소스, 역할) 조합에서 나온다 — 같은 팀장이라도
 * 영업활동은 부서까지, 매출현황은 전체를 볼 수 있다. 어느 리소스인지는
 * 호출하는 서비스가 스스로 넘긴다(화면이 알려주는 값을 믿지 않는다).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ScopeService {

    /** 범위 밖 요청에 쓰는 자리표시자 — 사번 형식이 아니라 어떤 행과도 매칭되지 않는다. */
    private static final String NO_ACCESS = "-no-access-";

    private final UserRepository userRepository;
    private final ResourceScopeService resourceScopeService;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    /** 이 리소스에 대한 내 범위. */
    public DataScope scopeOf(CrmResource resource) {
        return resourceScopeService.scopeOf(resource, SecurityContextUtil.getCurrentRole());
    }

    /**
     * 조회 허용 담당자 id 집합.
     * null 을 돌려주면 "전체 허용" — 호출부는 필터를 걸지 않는다.
     */
    public Set<String> allowedEmpIds(CrmResource resource) {
        DataScope scope = scopeOf(resource);
        if (scope == DataScope.ALL) return null;
        if (scope == DataScope.NONE) return Set.of(NO_ACCESS);

        String me = SecurityContextUtil.getCurrentUserId();
        Set<String> ids = new LinkedHashSet<>();
        if (me != null) ids.add(me);
        if (scope == DataScope.SELF) return ids;

        // DEPT - 같은 부서 구성원까지
        Integer deptCd = SecurityContextUtil.getCurrentDepartmentCd();
        if (deptCd != null) {
            userRepository.findAllByCompanyCd(companyCd()).stream()
                    .filter(u -> Objects.equals(u.getDeptCd(), deptCd))
                    .map(u -> u.getId().getId())
                    .forEach(ids::add);
        }
        return ids;
    }

    /** 이 담당자의 데이터를 볼 수 있는가. */
    public boolean canRead(CrmResource resource, String salesEmpId) {
        Set<String> allowed = allowedEmpIds(resource);
        return allowed == null || (salesEmpId != null && allowed.contains(salesEmpId));
    }

    /**
     * 쓰기(등록·수정·삭제) 허용 여부.
     * 조회와 같은 범위를 쓴다 — 팀장은 팀원 건을 대신 고칠 수 있다.
     */
    public void assertCanWrite(CrmResource resource, String salesEmpId) {
        if (!canRead(resource, salesEmpId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "본인 또는 소속 부서의 데이터만 볼 수 있습니다.");
        }
    }

    /**
     * 목록 조회에 쓸 담당자 필터.
     * 화면에서 특정 담당자를 지정했으면 그 값이 허용 범위 안에 있을 때만 통과시킨다.
     * 범위 밖을 요청하면 결과가 비도록 존재하지 않는 값을 돌려준다(오류 대신 빈 목록).
     */
    public Set<String> resolveFilter(CrmResource resource, String requestedEmpId) {
        return narrow(allowedEmpIds(resource), requestedEmpId);
    }

    /**
     * 이미 구한 허용 집합에 화면의 담당자 조건만 덧씌운다.
     * 목록 루프 안에서 resolveFilter 를 반복 호출하지 않으려고 분리했다.
     */
    public Set<String> narrow(Set<String> allowed, String requestedEmpId) {
        if (requestedEmpId == null || requestedEmpId.isBlank()) return allowed;
        if (allowed == null || allowed.contains(requestedEmpId)) {
            return Set.of(requestedEmpId);
        }
        return Set.of(NO_ACCESS);
    }

    /** 사용자가 존재하는지 + 내 범위인지 한 번에 확인. */
    public User requireUser(CrmResource resource, String userId) {
        User u = userRepository.findByCompanyCdAndUserId(companyCd(), userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT,
                        "등록되지 않은 담당자입니다: " + userId));
        assertCanWrite(resource, userId);
        return u;
    }

    /** 내 부서. DEPT 범위 판정에 쓴다. */
    public Integer currentDeptCd() {
        return SecurityContextUtil.getCurrentDepartmentCd();
    }

    public String currentUserId() {
        return SecurityContextUtil.getCurrentUserId();
    }
}
