package com.tara.crm.push.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.push.dto.PushDto;
import com.tara.crm.push.service.ActivityReminderScheduler;
import com.tara.crm.push.service.WebPushService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;

/** 웹 푸시 구독·테스트 — 모바일 앱(/m)의 "활동 알림" 켜기/끄기가 여기로 온다. */
@RestController
@RequestMapping("/api/push")
@RequiredArgsConstructor
@Tag(name = "Push", description = "웹 푸시 구독 (활동 알림)")
public class PushController {

    private final WebPushService webPush;
    private final ActivityReminderScheduler scheduler;

    @GetMapping("/vapid-public-key")
    @Operation(summary = "VAPID 공개키 — 브라우저가 구독할 때 applicationServerKey 로 쓴다. enabled=false 면 서버 미설정")
    public ApiResponse<PushDto.VapidKey> vapidKey() {
        return ApiResponse.ok(webPush.vapidKey());
    }

    @PostMapping("/subscriptions")
    @Operation(summary = "내 구독 등록(같은 endpoint 면 갱신)")
    public ApiResponse<Void> subscribe(@Valid @RequestBody PushDto.SubscribeRequest req) {
        webPush.subscribe(SecurityContextUtil.getCurrentCompanyCd(), SecurityContextUtil.getCurrentUserId(), req);
        return ApiResponse.ok();
    }

    @DeleteMapping("/subscriptions")
    @Operation(summary = "구독 해지(endpoint 기준)")
    public ApiResponse<Void> unsubscribe(@RequestParam String endpoint) {
        webPush.unsubscribe(endpoint);
        return ApiResponse.ok();
    }

    @GetMapping("/subscriptions/me")
    @Operation(summary = "내 구독 수 — 다른 기기 포함")
    public ApiResponse<PushDto.Count> mine() {
        return ApiResponse.ok(new PushDto.Count(webPush.countMine(SecurityContextUtil.getCurrentCompanyCd(), SecurityContextUtil.getCurrentUserId())));
    }

    @PostMapping("/test")
    @Operation(summary = "내 기기로 테스트 알림 1건 — 전달된 구독 수를 돌려준다")
    public ApiResponse<PushDto.Count> test() {
        int sent = webPush.sendToUser(SecurityContextUtil.getCurrentCompanyCd(), SecurityContextUtil.getCurrentUserId(),
                "알림 테스트", "활동일 아침 8시에 이렇게 알림이 옵니다.", "/m/activity", "test");
        return ApiResponse.ok(new PushDto.Count(sent));
    }

    @PostMapping("/reminders/run-now")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "[관리자] 활동 알림을 지금 보낸다(기본 오늘, date=yyyy-MM-dd 로 다른 날) — 스케줄러 확인용")
    public ApiResponse<PushDto.Count> runNow(@RequestParam(required = false) String date) {
        LocalDate day = date == null || date.isBlank() ? LocalDate.now(ZoneId.of("Asia/Seoul")) : LocalDate.parse(date);
        return ApiResponse.ok(new PushDto.Count(scheduler.sendReminders(day)));
    }
}
