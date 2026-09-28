package com.tara.crm.common.service;

import com.tara.crm.common.entity.ClosingPeriod;
import com.tara.crm.common.id.ClosingPeriodId;
import com.tara.crm.common.repository.ClosingPeriodRepository;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

/**
 * 매출/세금계산서 월마감 (시트 #2/#14).
 * SALES: 매출 등록 잠금 (시트의 "매출일자 마감")
 * TAX:   세금계산서 발행 잠금
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@Slf4j
public class ClosingPeriodService {

    /** 예약 마감 자동 활성화 시 closed_by 에 박는 사용자 식별자. */
    static final String SYSTEM_USER = "SYSTEM";

    public static final String TYPE_SALES = "SALES";
    public static final String TYPE_TAX = "TAX";

    private final ClosingPeriodRepository repository;

    public List<ClosingPeriod> list(String type) {
        Integer companyCd = Optional.ofNullable(SecurityContextUtil.getCurrentCompanyCd()).orElse(1000);
        Integer plantCd = Optional.ofNullable(SecurityContextUtil.getCurrentPlantCd()).orElse(1000);
        return repository.findByType(companyCd, plantCd, type);
    }

    /** 지금 시각 기준으로 실제 잠긴 월(YYYYMM) 목록 — 매출등록 달력에서 마감된 달을 비활성화하는 용도.
     *  예약 마감은 예약 시각이 지나야 포함되므로(isEffective) 시·분까지 반영된다. 전 역할 조회 가능(관리 목록과 분리). */
    public List<String> lockedMonths(String type) {
        LocalDateTime now = LocalDateTime.now();
        return list(type).stream()
            .filter(c -> c.isEffective(now))
            .map(c -> c.getId().getClosingYm())
            .sorted()
            .toList();
    }

    /** 즉시 마감 또는 예약 마감(scheduledDt 미래시각). */
    @Transactional
    public ClosingPeriod close(String type, String ym, LocalDateTime scheduledDt, String note) {
        Integer companyCd = Optional.ofNullable(SecurityContextUtil.getCurrentCompanyCd()).orElse(1000);
        Integer plantCd = Optional.ofNullable(SecurityContextUtil.getCurrentPlantCd()).orElse(1000);
        String userId = SecurityContextUtil.getCurrentUserId();
        ClosingPeriodId id = new ClosingPeriodId(companyCd, plantCd, type, ym);
        ClosingPeriod entity = repository.findById(id).orElseGet(() ->
            ClosingPeriod.builder().id(id).note(note).build());
        if (note != null) entity.setNote(note);
        if (scheduledDt != null && scheduledDt.isAfter(LocalDateTime.now())) {
            entity.setScheduledDt(scheduledDt);
            entity.setClosedAt(null);
            // 예약을 등록한 사용자를 화면의 처리자로 즉시 표시하고 실행 후에도 보존한다.
            entity.setClosedBy(userId);
        } else {
            entity.closeNow(userId);
            entity.setScheduledDt(null);
        }
        return repository.save(entity);
    }

    /** 마감 해제 (관리자용). */
    @Transactional
    public void unlock(String type, String ym) {
        Integer companyCd = Optional.ofNullable(SecurityContextUtil.getCurrentCompanyCd()).orElse(1000);
        Integer plantCd = Optional.ofNullable(SecurityContextUtil.getCurrentPlantCd()).orElse(1000);
        repository.findOne(companyCd, plantCd, type, ym).ifPresent(repository::delete);
    }

    /**
     * 시트 #2 — 예약 마감 자동 활성화.
     * scheduledDt 가 도래한 ClosingPeriod 의 closedAt 을 박아서 "예약" → "마감완료" 로 전이.
     * isLocked() 가 scheduledDt 만으로도 잠금 판정을 하므로 잠금 효력 자체는 즉시 발생하지만,
     * 명시적으로 closedAt 을 채워야 화면 라벨/감사 기록에서 마감 상태가 정확히 보인다.
     * <p>매 분 실행 (fixedDelay) — initialDelay 30초로 부팅 직후 폭주 방지.
     */
    @Scheduled(fixedDelay = 60_000L, initialDelay = 30_000L)
    @Transactional
    public void activateScheduled() {
        LocalDateTime now = LocalDateTime.now();
        List<ClosingPeriod> due = repository.findDueScheduled(now);
        if (due.isEmpty()) return;
        for (ClosingPeriod p : due) {
            p.setClosedAt(now);
            // 과거 데이터처럼 예약 등록자가 없는 경우에만 SYSTEM으로 보완한다.
            if (p.getClosedBy() == null || p.getClosedBy().isBlank()) {
                p.setClosedBy(SYSTEM_USER);
            }
        }
        log.info("예약 마감 자동 활성화: {}건 (now={})", due.size(), now);
    }

    /** 해당 type+해당 일자(date)가 속한 월(YYYYMM)이 마감되어 있으면 true. */
    public boolean isLocked(String type, LocalDate date) {
        if (date == null) return false;
        Integer companyCd = Optional.ofNullable(SecurityContextUtil.getCurrentCompanyCd()).orElse(1000);
        Integer plantCd = Optional.ofNullable(SecurityContextUtil.getCurrentPlantCd()).orElse(1000);
        String ym = date.format(DateTimeFormatter.ofPattern("yyyyMM"));
        return repository.findOne(companyCd, plantCd, type, ym)
            .map(c -> c.isEffective(LocalDateTime.now()))
            .orElse(false);
    }
}
