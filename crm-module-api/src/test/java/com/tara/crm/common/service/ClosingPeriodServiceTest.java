package com.tara.crm.common.service;

import com.tara.crm.common.entity.ClosingPeriod;
import com.tara.crm.common.id.ClosingPeriodId;
import com.tara.crm.common.repository.ClosingPeriodRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClosingPeriodServiceTest {

    @Mock private ClosingPeriodRepository repository;
    @InjectMocks private ClosingPeriodService service;

    private ClosingPeriod scheduled(String ym, LocalDateTime scheduledDt) {
        return ClosingPeriod.builder()
                .id(new ClosingPeriodId(1000, 1000, ClosingPeriodService.TYPE_SALES, ym))
                .scheduledDt(scheduledDt)
                .build();
    }

    @Test
    @DisplayName("activateScheduled - scheduledDt 도래분의 closedAt/closedBy 자동 설정 (시트 #2)")
    void activateScheduled_setsClosedAt() {
        ClosingPeriod p1 = scheduled("202503", LocalDateTime.now().minusMinutes(1));
        ClosingPeriod p2 = scheduled("202504", LocalDateTime.now().minusHours(1));
        when(repository.findDueScheduled(any(LocalDateTime.class))).thenReturn(List.of(p1, p2));

        service.activateScheduled();

        assertNotNull(p1.getClosedAt());
        assertEquals(ClosingPeriodService.SYSTEM_USER, p1.getClosedBy());
        assertNotNull(p2.getClosedAt());
        assertEquals(ClosingPeriodService.SYSTEM_USER, p2.getClosedBy());
    }

    @Test
    @DisplayName("activateScheduled - 도래분 없으면 noop, 로그/저장 부작용 없음")
    void activateScheduled_noop_whenEmpty() {
        when(repository.findDueScheduled(any(LocalDateTime.class))).thenReturn(List.of());

        service.activateScheduled();

        verify(repository, never()).save(any());
    }

    @Test
    @DisplayName("activateScheduled - scheduledDt 는 보존 (감사 기록)")
    void activateScheduled_keepsScheduledDt() {
        LocalDateTime origScheduled = LocalDateTime.now().minusMinutes(5);
        ClosingPeriod p = scheduled("202503", origScheduled);
        when(repository.findDueScheduled(any(LocalDateTime.class))).thenReturn(List.of(p));

        service.activateScheduled();

        assertEquals(origScheduled, p.getScheduledDt(), "scheduledDt 는 감사 기록용으로 보존");
    }
}
