package com.tara.crm.push.service;

import com.tara.crm.activity.entity.SalesActivity;
import com.tara.crm.activity.repository.SalesActivityRepository;
import com.tara.crm.push.entity.PushSubscription;
import com.tara.crm.push.repository.PushSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 활동 알림 스케줄러 — 매일 08:00(Asia/Seoul) 그날 활동이 있는 담당자에게 웹 푸시로 활동 제목을 보낸다.
 * (안드로이드 APK 는 폰 안의 로컬 알림이 따로 울린다 — 둘 다 켜 두면 두 번 올 수 있어 APK 쪽은 웹 푸시 구독을 만들지 않는다.)
 * 활동이 5건을 넘으면 5건은 제목 그대로, 나머지는 "외 n건" 한 줄로 묶는다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ActivityReminderScheduler {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final int MAX_INDIVIDUAL = 5;
    private static final Map<String, String> TYPE_LABEL = Map.of(
            "VISIT", "방문", "CALL", "전화", "MAIL", "메일", "QUOTE", "견적", "CONTRACT", "계약", "ETC", "기타");

    private final SalesActivityRepository activityRepository;
    private final PushSubscriptionRepository subscriptionRepository;
    private final WebPushService webPush;

    @Value("${webpush.reminder.enabled:true}")
    private boolean enabled;

    @Scheduled(cron = "${webpush.reminder.cron:0 0 8 * * *}", zone = "Asia/Seoul")
    public void scheduled() {
        if (!enabled || !webPush.isConfigured()) return;
        LocalDate today = LocalDate.now(SEOUL);
        int sent = sendReminders(today);
        log.info("[webpush] 활동 알림 발송 — {} 활동, 구독 {}건에 전달", today, sent);
    }

    /** 그날 활동을 담당자별로 모아 보낸다. 돌려주는 값 = 전달에 성공한 구독 수. 관리자 수동 실행(run-now)도 이걸 부른다. */
    public int sendReminders(LocalDate day) {
        List<SalesActivity> list = activityRepository.findByActivityDtOrderBySalesEmpIdAscActivityIdAsc(day);
        if (list.isEmpty()) return 0;
        Map<String, List<SalesActivity>> byUser = new LinkedHashMap<>();
        for (SalesActivity a : list) byUser.computeIfAbsent(a.getCompanyCd() + "|" + a.getSalesEmpId(), k -> new java.util.ArrayList<>()).add(a);

        int sent = 0;
        for (Map.Entry<String, List<SalesActivity>> e : byUser.entrySet()) {
            String[] k = e.getKey().split("\\|", 2);
            Integer companyCd = Integer.valueOf(k[0]);
            String userId = k[1];
            List<PushSubscription> subs = subscriptionRepository.findByCompanyCdAndUserId(companyCd, userId);
            if (subs.isEmpty()) continue;
            List<SalesActivity> acts = e.getValue();
            int n = Math.min(acts.size(), MAX_INDIVIDUAL);
            for (int i = 0; i < n; i++) {
                SalesActivity a = acts.get(i);
                String body = join(TYPE_LABEL.getOrDefault(a.getActivityType(), a.getActivityType()), a.getPartnerNm(),
                        a.getContent() == null ? null : a.getContent().substring(0, Math.min(60, a.getContent().length())));
                sent += webPush.send(subs, "오늘 활동 · " + a.getTitle(), body, "/m/activity", "activity-" + a.getActivityId());
            }
            if (acts.size() > n) {
                sent += webPush.send(subs, "오늘 활동 외 " + (acts.size() - n) + "건", "활동 화면에서 전체를 확인하세요.", "/m/activity", "activity-more-" + day);
            }
        }
        return sent;
    }

    private static String join(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isBlank()) continue;
            if (sb.length() > 0) sb.append(" · ");
            sb.append(p.trim());
        }
        return sb.toString();
    }
}
