package com.tara.crm.common.monitor;

import com.tara.crm.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 실시간 접속 현황 API.
 *  - GET /api/admin/active-users        : 접속/활동 사용자 목록(ADMIN 전용, 재기동 판단용)
 *  - GET /api/admin/active-users/ping   : 하트비트(모든 로그인 사용자) — 실기록은 JwtAuthenticationFilter 가 URI 로 heartbeat 처리
 */
@RestController
@RequestMapping("/api/admin/active-users")
@RequiredArgsConstructor
public class ActiveUserController {

    private final ActiveUserRegistry registry;

    public record ActiveUsersResponse(
            LocalDateTime serverTime,
            int onlineCount,
            int activeCount,
            List<ActiveUserRegistry.View> users) {}

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<ActiveUsersResponse> list() {
        List<ActiveUserRegistry.View> users = registry.snapshot();
        int active = (int) users.stream().filter(ActiveUserRegistry.View::active).count();
        return ApiResponse.ok(new ActiveUsersResponse(LocalDateTime.now(), users.size(), active, users));
    }

    /** 하트비트 — 탭이 열려 있음을 알린다. 기록 자체는 필터(요청 URI .../ping)가 heartbeat 로 처리. */
    @GetMapping("/ping")
    public ApiResponse<Void> ping() {
        return ApiResponse.ok();
    }
}
