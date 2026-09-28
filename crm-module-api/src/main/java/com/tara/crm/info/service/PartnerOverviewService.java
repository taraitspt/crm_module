package com.tara.crm.info.service;

import com.tara.crm.activity.dto.ActivityDto;
import com.tara.crm.activity.service.ActivityService;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.deal.service.DealService;
import com.tara.crm.info.dto.PartnerOverviewDto;
import com.tara.crm.info.entity.SalesPlan;
import com.tara.crm.info.repository.SalesPlanRepository;
import com.tara.crm.integration.erp.dto.ErpPartnerDto;
import com.tara.crm.integration.erp.repository.ErpPartnerRepository;
import com.tara.crm.stats.repository.OracleStatsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 거래처 카드(360도 뷰) 조립.
 * ERP 마스터·매출, 월매출계획, CRM 연락처·딜·활동을 한 응답으로 합친다.
 * ERP 가 죽어도 CRM 쪽 정보는 그대로 보이도록 각 조각을 개별적으로 감싼다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerOverviewService {

    private static final List<String> MONTHS =
            List.of("01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12");
    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    private final Optional<ErpPartnerRepository> erpPartnerRepository;
    private final Optional<OracleStatsRepository> oracleStatsRepository;
    private final SalesPlanRepository salesPlanRepository;
    private final PartnerContactService contactService;
    private final DealService dealService;
    private final ActivityService activityService;
    private final UserRepository userRepository;

    private Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    public PartnerOverviewDto.Response overview(String partnerCd, int year) {
        if (partnerCd == null || partnerCd.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        String pc = partnerCd.trim();

        PartnerOverviewDto.Profile profile = profile(pc);
        PartnerOverviewDto.Performance perf = performance(pc, year);
        ActivityDto.PartnerHistory history = activityService.partnerHistory(pc);

        // 거래처명은 ERP → 활동 기록 → 코드 순으로 폴백
        if (profile.getPartnerNm() == null) {
            profile.setPartnerNm(history.getPartnerNm() != null ? history.getPartnerNm() : pc);
        }

        return PartnerOverviewDto.Response.builder()
                .profile(profile)
                .performance(perf)
                .contacts(contactService.list(pc))
                .deals(dealService.byPartner(pc))
                .activities(history.getItems())
                .activityCount(history.getTotalCount())
                .lastActivityDt(history.getLastDt())
                .build();
    }

    private PartnerOverviewDto.Profile profile(String pc) {
        PartnerOverviewDto.Profile.ProfileBuilder b = PartnerOverviewDto.Profile.builder().partnerCd(pc);
        if (erpPartnerRepository.isEmpty()) return b.build();
        try {
            ErpPartnerDto e = erpPartnerRepository.get().findFullByPartnerCd(pc);
            if (e == null) return b.build();
            String addr = Optional.ofNullable(e.getBaseAddr()).orElse("")
                    + (e.getDtlAddr2() != null && !e.getDtlAddr2().isBlank() ? " " + e.getDtlAddr2() : "");
            b.partnerNm(e.getPartnerNm())
                    .bizrNo(e.getBizrNo())
                    .ceoNm(e.getCeoNm())
                    .bizType(e.getBiztpNm())
                    .bizItem(e.getBizcNm())
                    .address(addr.isBlank() ? null : addr.trim())
                    .telNo(e.getTelNo())
                    .faxNo(e.getFaxNo())
                    .erpContactNm(e.getAsgnrNm())
                    .erpContactDeptNm(e.getAsgnrDeptNm())
                    .erpContactPosition(e.getAsgnrOdtyNm())
                    .erpContactPhone(e.getAsgnrHpNo())
                    .erpContactTel(e.getAsgnrTelNo())
                    .erpContactEmail(e.getAsgnrEmail());
        } catch (Exception ex) {
            log.warn("[overview] ERP 거래처 조회 실패 partnerCd={}: {}", pc, ex.getMessage());
        }
        return b.build();
    }

    private PartnerOverviewDto.Performance performance(String pc, int year) {
        // 계획 — 이 거래처의 올해 월별 공임/용지
        long planTotal = 0, laborTotal = 0, paperTotal = 0;
        String ownerId = null;
        Map<String, long[]> planByMm = new LinkedHashMap<>();
        for (SalesPlan p : salesPlanRepository.findByYear(companyCd(), String.valueOf(year))) {
            if (!pc.equals(p.getId().getPartnerCd())) continue;
            long labor = p.getLaborAmt() == null ? 0 : p.getLaborAmt();
            long paper = p.getPaperAmt() == null ? 0 : p.getPaperAmt();
            planByMm.merge(p.getId().getPlanMm(), new long[]{labor + paper},
                    (a, x) -> new long[]{a[0] + x[0]});
            planTotal += labor + paper;
            laborTotal += labor;
            paperTotal += paper;
            if (ownerId == null) ownerId = p.getId().getSalesEmpId();
        }
        String ownerNm = null;
        if (ownerId != null) {
            ownerNm = userRepository.findByCompanyCdAndUserId(companyCd(), ownerId)
                    .map(User::getName).orElse(ownerId);
        }

        // 실적 — ERP 월별 매출 + 작년 총액
        Map<Integer, Long> actualByMonth = new HashMap<>();
        long curAmt = 0, prevAmt = 0;
        LocalDate lastBill = null;
        boolean erpAvailable = false;
        String erpMessage = null;
        if (oracleStatsRepository.isPresent()) {
            try {
                for (Object[] r : oracleStatsRepository.get().getCustomerYearlySales(year, null, pc, null)) {
                    int m = ((Number) r[4]).intValue();
                    long amt = ((Number) r[5]).longValue();
                    actualByMonth.merge(m, amt, Long::sum);
                    curAmt += amt;
                }
                for (Object[] r : oracleStatsRepository.get().getPartnerYearTotals(year - 1, 1, 12, null)) {
                    if (!pc.equals(r[0] == null ? "" : r[0].toString().trim())) continue;
                    prevAmt = ((Number) r[4]).longValue();
                }
                for (Object[] r : oracleStatsRepository.get().getPartnerYearTotals(year, 1, 12, null)) {
                    if (!pc.equals(r[0] == null ? "" : r[0].toString().trim())) continue;
                    try {
                        if (r[5] != null) lastBill = LocalDate.parse(r[5].toString().trim(), BASIC);
                    } catch (Exception ignore) { /* 전표일 형식이 이상하면 비운다 */ }
                }
                erpAvailable = true;
            } catch (Exception e) {
                Throwable root = e;
                while (root.getCause() != null && root.getCause() != root) root = root.getCause();
                log.warn("[overview] ERP 매출 조회 실패 partnerCd={}: {}", pc, root.getMessage());
                erpMessage = "ERP 매출을 가져오지 못했습니다: " + root.getMessage();
            }
        } else {
            erpMessage = "ERP(Oracle) 연결이 비활성화되어 실적을 표시할 수 없습니다.";
        }

        List<PartnerOverviewDto.MonthPoint> months = new ArrayList<>();
        for (String mm : MONTHS) {
            long[] plan = planByMm.get(mm);
            months.add(PartnerOverviewDto.MonthPoint.builder()
                    .planMm(mm)
                    .planAmt(plan == null ? 0 : plan[0])
                    .actualAmt(actualByMonth.getOrDefault(Integer.parseInt(mm), 0L))
                    .build());
        }

        return PartnerOverviewDto.Performance.builder()
                .year(year)
                .planAmt(planTotal).planLaborAmt(laborTotal).planPaperAmt(paperTotal)
                .ownerEmpId(ownerId).ownerNm(ownerNm)
                .curAmt(curAmt).prevAmt(prevAmt)
                .changeRate(prevAmt > 0 ? Math.round(((double) curAmt / prevAmt) * 1000) / 10.0 : null)
                .lastBillDt(lastBill)
                .months(months)
                .erpAvailable(erpAvailable).erpMessage(erpMessage)
                .build();
    }
}
