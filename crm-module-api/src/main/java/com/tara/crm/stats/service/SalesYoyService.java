package com.tara.crm.stats.service;

import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.menu.CrmResource;
import com.tara.crm.common.service.ScopeService;
import com.tara.crm.common.util.DataScope;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.stats.dto.SalesYoyDto;
import com.tara.crm.stats.repository.OracleStatsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 매출현황(전년 대비) — 계획 없이 순수 매출을 작년 같은 달과 비교한다(2026-10-19 사용자 요청).
 * 원천은 매출현황(계획 대비)과 같은 ERP 매출전표(SD_BILL 전체, 공급가액 TRAN_AMT) — 거래처·비용센터·영업담당·월 합계.
 * 사업부문은 타라티피에스(공장 1000)로 고정 — 이 프로젝트는 TPS 전용(사용자 2026-10-16).
 *
 * 데이터 범위는 매출리스트와 같은 SALES_STATS 규칙: 전체면 다 보이고, 본인이면 매출 라인의 영업담당 사번이 나(허용 담당자),
 * 부서면 거기에 더해 우리 부서로 매핑되는 비용센터 매출까지.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SalesYoyService {

    /** 타라티피에스 공장 */
    private static final String PLANT_TPS = "1000";

    private final Optional<OracleStatsRepository> oracleStatsRepository;
    private final ScopeService scopeService;
    private final UserRepository userRepository;
    private final com.tara.crm.common.org.HqResolver hqResolver;

    public SalesYoyDto.Response get(int year) {
        if (oracleStatsRepository.isEmpty()) {
            return new SalesYoyDto.Response(year, List.of(), false, "ERP(Oracle) 연결이 비활성화되어 매출을 표시할 수 없습니다.", 0);
        }
        DataScope scope = scopeService.scopeOf(CrmResource.SALES_STATS);
        if (scope == DataScope.NONE) return new SalesYoyDto.Response(year, List.of(), true, null, 0);

        Map<String, Acc> acc = new LinkedHashMap<>();
        try {
            collect(acc, year, true);
            collect(acc, year - 1, false);
        } catch (Exception e) {
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            String reason = root.getMessage() == null ? e.getClass().getSimpleName() : root.getMessage().trim();
            log.warn("[sales-yoy] ERP 매출 조회 실패: {}", reason, e);
            return new SalesYoyDto.Response(year, List.of(), false, "ERP 매출을 가져오지 못했습니다: " + reason, 0);
        }

        List<SalesYoyDto.Row> all = new ArrayList<>(acc.size());
        com.tara.crm.common.org.HqResolver.Lookup hqs = hqResolver.lookup();
        // 비용센터·영업담당으로 본부를 못 찾는 줄(대개 담당·비용센터가 빈 차감 전표)은 같은 거래처의 주된 본부(올해+작년 매출 큰 쪽)로
        Map<Acc, com.tara.crm.common.org.HqResolver.Hq> hqOf = new HashMap<>();
        Map<String, Map<com.tara.crm.common.org.HqResolver.Hq, Long>> partnerHq = new HashMap<>();
        acc.values().forEach(a -> {
            com.tara.crm.common.org.HqResolver.Hq h = hqs.ofCc(a.ccCd, a.empNo);
            if (h == null) return;
            hqOf.put(a, h);
            long w = 0;
            for (int i = 0; i < 12; i++) w += Math.abs(a.cur[i]) + Math.abs(a.prev[i]);
            partnerHq.computeIfAbsent(a.partnerCd, k -> new HashMap<>()).merge(h, w, Long::sum);
        });
        acc.values().forEach(a -> {
            com.tara.crm.common.org.HqResolver.Hq h = hqOf.get(a);
            if (h == null) {
                h = partnerHq.getOrDefault(a.partnerCd, Map.of()).entrySet().stream()
                        .max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null);
            }
            all.add(new SalesYoyDto.Row(a.partnerCd, a.partnerNm, a.ccCd, a.ccNm, a.empNo, a.empNm, a.cur, a.prev,
                    h == null ? null : h.cd(), h == null ? null : h.nm(), h == null ? null : h.sort()));
        });
        if (scope == DataScope.ALL) return new SalesYoyDto.Response(year, all, true, null, 0);

        // 본인·부서 — 매출리스트(SalesListService)와 같은 규칙
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        List<User> users = userRepository.findAllByCompanyCd(companyCd != null ? companyCd : 1000);
        Set<String> allowedIds = Optional.ofNullable(scopeService.allowedEmpIds(CrmResource.SALES_STATS)).orElse(Set.of());
        Set<String> allowedEmpNos = users.stream()
                .filter(u -> allowedIds.contains(u.getId().getId()))
                .map(User::getEmployeeNo).filter(Objects::nonNull).map(String::trim)
                .collect(Collectors.toSet());
        Set<String> myCcs = scope == DataScope.DEPT ? SalesListService.ccsOfDept(users, scopeService.currentDeptCd()) : Set.of();
        List<SalesYoyDto.Row> visible = all.stream()
                .filter(r -> (!r.empNo().isEmpty() && allowedEmpNos.contains(r.empNo())) || (!r.ccCd().isEmpty() && myCcs.contains(r.ccCd())))
                .toList();
        return new SalesYoyDto.Response(year, visible, true, null, all.size() - visible.size());
    }

    private void collect(Map<String, Acc> acc, int year, boolean current) {
        for (Object[] r : oracleStatsRepository.get().getYearlySalesByCcEmp(year, PLANT_TPS)) {
            String partnerCd = str(r[0]);
            String ccCd = str(r[2]);
            String empNo = str(r[4]);
            int month = ((Number) r[6]).intValue();
            if (month < 1 || month > 12) continue;
            long amt = ((Number) r[7]).longValue();
            Acc a = acc.computeIfAbsent(partnerCd + "|" + ccCd + "|" + empNo, k -> new Acc(partnerCd, ccCd, empNo));
            if (a.partnerNm == null && r[1] != null) a.partnerNm = str(r[1]);
            if (a.ccNm == null && r[3] != null) a.ccNm = str(r[3]);
            if (a.empNm == null && r[5] != null) a.empNm = str(r[5]);
            (current ? a.cur : a.prev)[month - 1] += amt;
        }
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString().trim();
    }

    private static final class Acc {
        final String partnerCd;
        final String ccCd;
        final String empNo;
        String partnerNm;
        String ccNm;
        String empNm;
        final long[] cur = new long[12];
        final long[] prev = new long[12];

        Acc(String partnerCd, String ccCd, String empNo) {
            this.partnerCd = partnerCd;
            this.ccCd = ccCd;
            this.empNo = empNo;
        }
    }
}
