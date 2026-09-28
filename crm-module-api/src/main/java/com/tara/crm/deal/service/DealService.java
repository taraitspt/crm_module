package com.tara.crm.deal.service;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.menu.CrmResource;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.deal.dto.DealDto;
import com.tara.crm.deal.entity.SalesDeal;
import com.tara.crm.deal.repository.SalesDealRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 영업기회(딜) — CRUD + 단계 이동 + 파이프라인 집계. */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DealService {

    private final SalesDealRepository repository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final com.tara.crm.activity.repository.SalesActivityRepository activityRepository;
    private final com.tara.crm.common.service.ScopeService scopeService;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public DealDto.Pipeline pipeline(String salesEmpId, String partnerCd, String stage, String keyword) {
        List<SalesDeal> rows = scoped(repository.search(companyCd(),
                null, blankToNull(partnerCd), blankToNull(stage), blankToNull(keyword)), salesEmpId);
        List<DealDto.Item> items = toItems(rows);

        Map<String, DealDto.StageSummary> byStage = new LinkedHashMap<>();
        for (DealDto.Stage s : DealDto.Stage.values()) {
            byStage.put(s.name(), DealDto.StageSummary.builder().stage(s.name()).build());
        }
        int openCount = 0, wonCount = 0, lostCount = 0;
        long openAmt = 0, weighted = 0, wonAmt = 0, lostAmt = 0;
        for (DealDto.Item it : items) {
            DealDto.StageSummary s = byStage.computeIfAbsent(it.getStage(),
                    k -> DealDto.StageSummary.builder().stage(k).build());
            s.setCount(s.getCount() + 1);
            s.setExpectedAmt(s.getExpectedAmt() + it.getExpectedAmt());
            s.setWeightedAmt(s.getWeightedAmt() + it.getWeightedAmt());

            DealDto.Stage st = parseStage(it.getStage());
            if (st == DealDto.Stage.WON) {
                wonCount++;
                wonAmt += it.getExpectedAmt();
            } else if (st == DealDto.Stage.LOST) {
                lostCount++;
                lostAmt += it.getExpectedAmt();
            } else {
                openCount++;
                openAmt += it.getExpectedAmt();
                weighted += it.getWeightedAmt();
            }
        }
        return DealDto.Pipeline.builder()
                .items(items).byStage(byStage)
                .openCount(openCount).openAmt(openAmt).weightedAmt(weighted)
                .wonCount(wonCount).wonAmt(wonAmt)
                .lostCount(lostCount).lostAmt(lostAmt)
                .build();
    }

    public List<DealDto.Item> byPartner(String partnerCd) {
        if (partnerCd == null || partnerCd.isBlank()) return List.of();
        return toItems(scoped(repository.findByPartner(companyCd(), partnerCd.trim()), null));
    }

    /** 데이터 범위 적용 — 일반매니저는 본인 딜만, 팀장은 부서, 관리자·영업지원은 전체. */
    private List<SalesDeal> scoped(List<SalesDeal> rows, String requestedEmpId) {
        Set<String> allowed = scopeService.resolveFilter(CrmResource.DEAL, blankToNull(requestedEmpId));
        if (allowed == null) return rows;
        return rows.stream().filter(d -> allowed.contains(d.getSalesEmpId())).toList();
    }

    @Transactional
    public Long create(DealDto.SaveRequest req) {
        SalesDeal d = new SalesDeal();
        d.setCompanyCd(companyCd());
        apply(d, req);
        return repository.save(d).getDealId();
    }

    @Transactional
    public void update(Long id, DealDto.SaveRequest req) {
        SalesDeal d = load(id);
        apply(d, req);
        repository.save(d);
    }

    /** 칸반에서 카드를 옮길 때 — 단계와 확률만 바꾼다. */
    @Transactional
    public void changeStage(Long id, DealDto.StageRequest req) {
        SalesDeal d = load(id);
        DealDto.Stage st = parseStageOrThrow(req.getStage());
        d.setStage(st.name());
        d.setProbability(st.getDefaultProbability());
        d.setClosedDt(st.isOpen() ? null : LocalDate.now());
        if (st == DealDto.Stage.LOST) {
            d.setLostReason(blankToNull(req.getLostReason()));
        } else {
            d.setLostReason(null);
        }
        repository.save(d);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(load(id));
    }

    private SalesDeal load(Long id) {
        SalesDeal d = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!Objects.equals(d.getCompanyCd(), companyCd())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        scopeService.assertCanWrite(CrmResource.DEAL, d.getSalesEmpId());
        return d;
    }

    private void apply(SalesDeal d, DealDto.SaveRequest req) {
        DealDto.Stage st = parseStageOrThrow(req.getStage());
        // 담당자 존재 확인 + 내 데이터 범위인지 확인
        scopeService.requireUser(CrmResource.DEAL, req.getSalesEmpId());
        d.setPartnerCd(blankToNull(req.getPartnerCd()));
        d.setPartnerNm(blankToNull(req.getPartnerNm()));
        d.setSalesEmpId(req.getSalesEmpId());
        d.setTitle(req.getTitle().trim());
        d.setStage(st.name());
        d.setExpectedAmt(req.getExpectedAmt() == null ? 0L : req.getExpectedAmt());
        // 확률을 비우면 단계 기본값. 0~100 밖의 값은 잘라낸다.
        int prob = req.getProbability() == null ? st.getDefaultProbability() : req.getProbability();
        d.setProbability(Math.max(0, Math.min(100, prob)));
        d.setExpectedCloseDt(req.getExpectedCloseDt());
        d.setClosedDt(st.isOpen() ? null : (d.getClosedDt() != null ? d.getClosedDt() : LocalDate.now()));
        d.setLostReason(st == DealDto.Stage.LOST ? blankToNull(req.getLostReason()) : null);
        d.setContent(req.getContent());
    }

    private static DealDto.Stage parseStage(String s) {
        try {
            return DealDto.Stage.valueOf(s);
        } catch (Exception e) {
            return DealDto.Stage.LEAD;
        }
    }

    private static DealDto.Stage parseStageOrThrow(String s) {
        try {
            return DealDto.Stage.valueOf(s);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 단계입니다: " + s);
        }
    }

    private List<DealDto.Item> toItems(List<SalesDeal> rows) {
        if (rows.isEmpty()) return List.of();
        Map<String, User> users = userRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(u -> u.getId().getId(), Function.identity(), (x, y) -> x));
        Map<Integer, String> deptNames = departmentRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (x, y) -> x));
        LocalDate today = LocalDate.now();

        // 딜별 활동 건수·마지막 활동일을 한 번에 읽어 카드에 붙인다.
        Map<Long, Object[]> actStats = new HashMap<>();
        for (Object[] r : activityRepository.dealActivityStats(companyCd())) {
            if (r[0] != null) actStats.put(((Number) r[0]).longValue(), r);
        }

        return rows.stream().map(d -> {
            Object[] st = actStats.get(d.getDealId());
            User u = users.get(d.getSalesEmpId());
            long amt = d.getExpectedAmt() == null ? 0L : d.getExpectedAmt();
            int prob = d.getProbability() == null ? 0 : d.getProbability();
            DealDto.Stage stage = parseStage(d.getStage());
            return DealDto.Item.builder()
                    .dealId(d.getDealId())
                    .partnerCd(d.getPartnerCd())
                    .partnerNm(d.getPartnerNm())
                    .salesEmpId(d.getSalesEmpId())
                    .empNm(u != null ? u.getName() : d.getSalesEmpId())
                    .deptNm(u != null && u.getDeptCd() != null ? deptNames.get(u.getDeptCd()) : null)
                    .title(d.getTitle())
                    .stage(d.getStage())
                    .expectedAmt(amt)
                    .probability(prob)
                    .weightedAmt(amt * prob / 100)
                    .expectedCloseDt(d.getExpectedCloseDt())
                    .closedDt(d.getClosedDt())
                    .lostReason(d.getLostReason())
                    .content(d.getContent())
                    .overdue(stage.isOpen() && d.getExpectedCloseDt() != null && d.getExpectedCloseDt().isBefore(today))
                    .activityCount(st == null ? 0 : ((Number) st[1]).intValue())
                    .lastActivityDt(st == null ? null : (LocalDate) st[2])
                    .build();
        }).toList();
    }
}
