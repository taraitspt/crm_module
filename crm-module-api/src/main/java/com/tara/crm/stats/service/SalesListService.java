package com.tara.crm.stats.service;

import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.menu.CrmResource;
import com.tara.crm.common.service.ScopeService;
import com.tara.crm.common.util.DataScope;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.stats.dto.SalesListDto;
import com.tara.crm.stats.repository.OracleSalesListRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 매출리스트 — ERP 매출 상세를 기간·사업부문으로 조회하고 SALES_STATS 데이터 범위로 거른다.
 *
 * 범위 판정(ERP 매출 줄에는 CRM 사용자 id 가 없어서 사번·비용센터로 잇는다):
 *  ALL  - 전부
 *  SELF - 영업담당 사번이 내 사번인 줄
 *  DEPT - 영업담당이 우리 부서원이거나, 비용센터(CC)가 우리 부서로 매핑되는 줄
 *         (CC → 부서는 users.cc_cd 다수결 — 관리 필요 거래처와 같은 규칙)
 *  NONE - 없음
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SalesListService {

    /** 한 번에 조회할 수 있는 최대 기간(일). TPS 한 달 약 5천 줄. */
    public static final long MAX_RANGE_DAYS = 92;

    private final Optional<OracleSalesListRepository> repository;
    private final ScopeService scopeService;
    private final UserRepository userRepository;

    public SalesListDto.Response list(LocalDate from, LocalDate to, String plantCd) {
        if (to.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일이 시작일보다 앞설 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_RANGE_DAYS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        OracleSalesListRepository oracle = repository.orElseThrow(
                () -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));

        DataScope scope = scopeService.scopeOf(CrmResource.SALES_STATS);
        if (scope == DataScope.NONE) {
            return SalesListDto.Response.builder().rows(List.of()).hiddenByScope(0).build();
        }
        List<SalesListDto.Row> all = oracle.findRows(from, to, plantCd);
        if (scope == DataScope.ALL) {
            return SalesListDto.Response.builder().rows(all).hiddenByScope(0).build();
        }

        List<User> users = userRepository.findAllByCompanyCd(companyCd());
        // 허용 담당자(users.id) → 그들의 ERP 사번
        Set<String> allowedIds = Optional.ofNullable(scopeService.allowedEmpIds(CrmResource.SALES_STATS)).orElse(Set.of());
        Set<String> allowedEmpNos = users.stream()
                .filter(u -> allowedIds.contains(u.getId().getId()))
                .map(User::getEmployeeNo).filter(Objects::nonNull).map(String::trim)
                .collect(Collectors.toSet());
        // DEPT 일 때만 비용센터로도 연다
        Set<String> myCcs = scope == DataScope.DEPT ? ccsOfDept(users, scopeService.currentDeptCd()) : Set.of();

        List<SalesListDto.Row> visible = all.stream()
                .filter(r -> (r.getSalesEmpNo() != null && allowedEmpNos.contains(r.getSalesEmpNo()))
                        || (r.getCcCd() != null && myCcs.contains(r.getCcCd())))
                .toList();
        return SalesListDto.Response.builder().rows(visible).hiddenByScope(all.size() - visible.size()).build();
    }

    /** 이 부서로 매핑되는 비용센터들 — cc 별로 인원이 가장 많은 부서를 대표로 본다. */
    private static Set<String> ccsOfDept(List<User> users, Integer deptCd) {
        if (deptCd == null) return Set.of();
        Map<String, Map<Integer, Integer>> counts = new HashMap<>();
        for (User u : users) {
            if (u.getCcCd() == null || u.getCcCd().isBlank() || u.getDeptCd() == null) continue;
            counts.computeIfAbsent(u.getCcCd().trim(), k -> new HashMap<>()).merge(u.getDeptCd(), 1, Integer::sum);
        }
        Set<String> out = new HashSet<>();
        counts.forEach((cc, m) -> m.entrySet().stream().max(Map.Entry.comparingByValue())
                .filter(e -> Objects.equals(e.getKey(), deptCd))
                .ifPresent(e -> out.add(cc)));
        return out;
    }

    private static Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }
}
