package com.tara.crm.activity.service;

import com.tara.crm.activity.dto.ActivityDto;
import com.tara.crm.activity.entity.SalesActivity;
import com.tara.crm.activity.repository.SalesActivityRepository;
import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.menu.CrmResource;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 영업활동 — 등록/수정/삭제와 세 가지 조회(캘린더, 일자별 보드, 거래처 히스토리).
 * 조회는 모두 같은 search() 결과를 서로 다른 모양으로 접어서 만든다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ActivityService {

    private static final DateTimeFormatter D = DateTimeFormatter.ISO_LOCAL_DATE;

    private final SalesActivityRepository repository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final com.tara.crm.deal.repository.SalesDealRepository dealRepository;
    private final com.tara.crm.common.service.ScopeService scopeService;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    // ── 조회 ──

    public List<ActivityDto.Item> search(LocalDate from, LocalDate to, String salesEmpId,
                                         String partnerCd, String activityType, String keyword) {
        List<SalesActivity> rows = repository.search(companyCd(), from, to,
                null, blankToNull(partnerCd), blankToNull(activityType), blankToNull(keyword));
        return toItems(scoped(rows, salesEmpId));
    }

    /**
     * 데이터 범위 적용 — 일반매니저는 본인 것만, 팀장은 부서, 관리자·영업지원은 전체.
     * 화면에서 특정 담당자를 지정했으면 그 값도 함께 적용한다.
     */
    private List<SalesActivity> scoped(List<SalesActivity> rows, String requestedEmpId) {
        Set<String> allowed = scopeService.resolveFilter(CrmResource.ACTIVITY, blankToNull(requestedEmpId));
        if (allowed == null) return rows;
        return rows.stream().filter(a -> allowed.contains(a.getSalesEmpId())).toList();
    }

    /** 캘린더 — 해당 월의 일자별 건수/유형분포/팔로업 수. */
    public List<ActivityDto.CalendarDay> calendar(int year, int month, String salesEmpId, String partnerCd) {
        LocalDate from = LocalDate.of(year, month, 1);
        LocalDate to = from.withDayOfMonth(from.lengthOfMonth());
        List<SalesActivity> rows = scoped(repository.search(companyCd(), from, to,
                null, blankToNull(partnerCd), null, null), salesEmpId);

        Map<LocalDate, ActivityDto.CalendarDay> byDate = new LinkedHashMap<>();
        for (SalesActivity a : rows) {
            ActivityDto.CalendarDay d = byDate.computeIfAbsent(a.getActivityDt(),
                    k -> ActivityDto.CalendarDay.builder().date(k).build());
            d.setTotal(d.getTotal() + 1);
            d.getByType().merge(a.getActivityType(), 1, Integer::sum);
        }
        // 이 달에 예정된 다음 액션도 같은 칸에 얹는다(등록일과 무관하게 조회).
        for (SalesActivity a : scoped(repository.findUpcoming(companyCd(), from, to, null), salesEmpId)) {
            ActivityDto.CalendarDay d = byDate.computeIfAbsent(a.getNextActionDt(),
                    k -> ActivityDto.CalendarDay.builder().date(k).build());
            d.setFollowUps(d.getFollowUps() + 1);
        }
        // 영업기회 마감 예정일도 같은 달력에 — 딜과 활동을 따로 보지 않게 한다.
        for (com.tara.crm.deal.entity.SalesDeal deal
                : dealRepository.findClosingBetween(companyCd(), from, to, blankToNull(salesEmpId))) {
            ActivityDto.CalendarDay d = byDate.computeIfAbsent(deal.getExpectedCloseDt(),
                    k -> ActivityDto.CalendarDay.builder().date(k).build());
            d.setDealCloses(d.getDealCloses() + 1);
        }
        return byDate.values().stream()
                .sorted(Comparator.comparing(ActivityDto.CalendarDay::getDate))
                .toList();
    }

    /**
     * 일자별 영업현황 보드 — 행 기준(groupBy=EMP|PARTNER), 열은 from~to 날짜.
     * 셀 값은 그날 그 행의 활동 건수.
     */
    public ActivityDto.Board board(LocalDate from, LocalDate to, String groupBy,
                                   String salesEmpId, String partnerCd) {
        if (from.isAfter(to)) throw new BusinessException(ErrorCode.INVALID_INPUT);
        if (from.plusDays(92).isBefore(to)) {
            // 열이 무한정 늘면 화면이 못 버틴다. 최대 약 3개월.
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회 기간은 최대 3개월입니다.");
        }
        boolean byPartner = "PARTNER".equalsIgnoreCase(groupBy);
        List<ActivityDto.Item> items = search(from, to, salesEmpId, partnerCd, null, null);

        List<String> dates = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) dates.add(d.format(D));

        Map<String, ActivityDto.BoardRow> rows = new LinkedHashMap<>();
        Map<String, Integer> dateTotals = new LinkedHashMap<>();
        int total = 0;
        for (ActivityDto.Item it : items) {
            String key = byPartner
                    ? (it.getPartnerCd() == null ? "-" : it.getPartnerCd())
                    : it.getSalesEmpId();
            String label = byPartner
                    ? (it.getPartnerNm() != null ? it.getPartnerNm() : "(거래처 없음)")
                    : it.getEmpNm();
            String sub = byPartner ? it.getPartnerCd() : it.getDeptNm();
            ActivityDto.BoardRow row = rows.computeIfAbsent(key, k -> ActivityDto.BoardRow.builder()
                    .rowKey(k).rowLabel(label).subLabel(sub).build());
            String ds = it.getActivityDt().format(D);
            row.getCounts().merge(ds, 1, Integer::sum);
            row.setTotal(row.getTotal() + 1);
            dateTotals.merge(ds, 1, Integer::sum);
            total++;
        }
        List<ActivityDto.BoardRow> sorted = rows.values().stream()
                .sorted(Comparator.comparingInt(ActivityDto.BoardRow::getTotal).reversed())
                .toList();
        return ActivityDto.Board.builder()
                .dates(dates).rows(sorted).dateTotals(dateTotals).total(total)
                .build();
    }

    /** 특정 영업기회에 달린 활동 — 딜 카드에서 진행 경과를 펼쳐 볼 때. */
    public List<ActivityDto.Item> byDeal(Long dealId) {
        if (dealId == null) return List.of();
        return toItems(scoped(repository.findByDeal(companyCd(), dealId), null));
    }

    /**
     * 팔로업(다음 액션) 예정 목록 — nextActionDt 가 기간 안에 있는 활동.
     * 캘린더의 ★ 배지, 오늘의 할 일 알림이 같이 쓴다. activityDt 가 아니라 nextActionDt 기준인 게 핵심.
     */
    public List<ActivityDto.Item> followUps(LocalDate from, LocalDate to, String salesEmpId) {
        return toItems(scoped(repository.findUpcoming(companyCd(), from, to, null), salesEmpId));
    }

    /** 거래처 히스토리 — 전체 기간 타임라인 + 요약. */
    public ActivityDto.PartnerHistory partnerHistory(String partnerCd) {
        if (partnerCd == null || partnerCd.isBlank()) throw new BusinessException(ErrorCode.INVALID_INPUT);
        List<ActivityDto.Item> items = toItems(scoped(repository.findByPartner(companyCd(), partnerCd.trim()), null));

        Map<String, Integer> byType = new LinkedHashMap<>();
        items.forEach(i -> byType.merge(i.getActivityType(), 1, Integer::sum));
        return ActivityDto.PartnerHistory.builder()
                .partnerCd(partnerCd.trim())
                .partnerNm(items.isEmpty() ? null : items.get(0).getPartnerNm())
                .totalCount(items.size())
                .firstDt(items.isEmpty() ? null : items.get(items.size() - 1).getActivityDt())
                .lastDt(items.isEmpty() ? null : items.get(0).getActivityDt())
                .byType(byType)
                .items(items)
                .build();
    }

    // ── 등록/수정/삭제 ──

    @Transactional
    public Long create(ActivityDto.SaveRequest req) {
        validate(req);
        SalesActivity a = new SalesActivity();
        a.setCompanyCd(companyCd());
        apply(a, req);
        return repository.save(a).getActivityId();
    }

    @Transactional
    public void update(Long id, ActivityDto.SaveRequest req) {
        validate(req);
        SalesActivity a = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!Objects.equals(a.getCompanyCd(), companyCd())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        scopeService.assertCanWrite(CrmResource.ACTIVITY, a.getSalesEmpId());   // 남의 건을 고치지 못하게
        apply(a, req);
        repository.save(a);
    }

    @Transactional
    public void delete(Long id) {
        SalesActivity a = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!Objects.equals(a.getCompanyCd(), companyCd())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        scopeService.assertCanWrite(CrmResource.ACTIVITY, a.getSalesEmpId());
        repository.delete(a);
    }

    private void validate(ActivityDto.SaveRequest req) {
        try {
            ActivityDto.Type.valueOf(req.getActivityType());
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 활동유형입니다: " + req.getActivityType());
        }
        // 담당자 존재 확인 + 내 데이터 범위인지 확인(본인/부서/전체)
        scopeService.requireUser(CrmResource.ACTIVITY, req.getSalesEmpId());
    }

    private void apply(SalesActivity a, ActivityDto.SaveRequest req) {
        a.setActivityDt(req.getActivityDt());
        a.setSalesEmpId(req.getSalesEmpId());
        a.setPartnerCd(blankToNull(req.getPartnerCd()));
        a.setPartnerNm(blankToNull(req.getPartnerNm()));
        a.setActivityType(req.getActivityType());
        a.setTitle(req.getTitle().trim());
        a.setContent(req.getContent());
        a.setNextActionDt(req.getNextActionDt());
        a.setNextAction(blankToNull(req.getNextAction()));
        a.setAmount(req.getAmount());
        a.setDealId(req.getDealId());
    }

    // ── 공통 변환 ──

    private List<ActivityDto.Item> toItems(List<SalesActivity> rows) {
        if (rows.isEmpty()) return List.of();
        Map<String, User> users = userRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(u -> u.getId().getId(), Function.identity(), (x, y) -> x));
        Map<Integer, String> deptNames = departmentRepository.findAllByCompanyCd(companyCd()).stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (x, y) -> x));

        // 연결된 딜 제목/단계를 채우기 위해 참조된 id 만 한 번에 읽는다.
        Set<Long> dealIds = rows.stream().map(SalesActivity::getDealId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, com.tara.crm.deal.entity.SalesDeal> deals = dealIds.isEmpty() ? Map.of()
                : dealRepository.findAllById(dealIds).stream()
                .collect(Collectors.toMap(com.tara.crm.deal.entity.SalesDeal::getDealId, Function.identity(), (x, y) -> x));

        return rows.stream().map(a -> {
            com.tara.crm.deal.entity.SalesDeal deal = a.getDealId() == null ? null : deals.get(a.getDealId());
            User u = users.get(a.getSalesEmpId());
            Integer deptCd = u != null ? u.getDeptCd() : null;
            return ActivityDto.Item.builder()
                    .activityId(a.getActivityId())
                    .activityDt(a.getActivityDt())
                    .salesEmpId(a.getSalesEmpId())
                    .empNm(u != null ? u.getName() : a.getSalesEmpId())
                    .deptCd(deptCd)
                    .deptNm(deptCd != null ? deptNames.get(deptCd) : null)
                    .partnerCd(a.getPartnerCd())
                    .partnerNm(a.getPartnerNm())
                    .activityType(a.getActivityType())
                    .title(a.getTitle())
                    .content(a.getContent())
                    .nextActionDt(a.getNextActionDt())
                    .nextAction(a.getNextAction())
                    .amount(a.getAmount())
                    .dealId(a.getDealId())
                    .dealTitle(deal != null ? deal.getTitle() : null)
                    .dealStage(deal != null ? deal.getStage() : null)
                    .build();
        }).toList();
    }
}
