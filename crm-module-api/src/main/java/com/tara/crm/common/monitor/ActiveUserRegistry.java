package com.tara.crm.common.monitor;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 실시간 접속 현황 레지스트리(in-memory).
 *
 * JWT 무상태 인증이라 서버에 세션이 없어 "열린 탭 수"를 직접 알 수 없다. 대신
 * 모든 인증 요청이 통과하는 {@code JwtAuthenticationFilter} 에서 사용자별 마지막 시각을 기록해
 *  - 실제 사용자 요청(=활동중, lastActivity)과
 *  - 하트비트 핑 포함 아무 요청(=접속중, lastBeat)
 * 을 구분한다. 재기동 판단(누가 지금 뭘 하나) 용도. 앱 재기동 시 초기화(휘발성 — 판단 직전에 보면 되므로 무방).
 */
@Component
public class ActiveUserRegistry {

    /** 활동중(실제 요청) 판정 창 — 이 시간 내 실요청이 있으면 "지금 뭔가 하는 중". */
    private static final Duration ACTIVE_WINDOW = Duration.ofMinutes(2);
    /** 접속중(하트비트/최근활동) 판정 창 — 초과하면 이탈로 보고 목록에서 제거. 하트비트 45초 간격 대비 여유. */
    private static final Duration ONLINE_WINDOW = Duration.ofMinutes(3);

    private static final class Entry {
        final String userId;
        volatile String name;
        volatile String role;
        volatile Instant lastBeat;      // 아무 인증 요청(핑 포함)
        volatile Instant lastActivity;  // 실제 사용자 요청(핑 제외)
        volatile String lastPath;       // 마지막 실요청 URI

        Entry(String userId) { this.userId = userId; }
    }

    /** snapshot 반환 뷰 — Jackson 직렬화 대상. */
    public record View(
            String userId,
            String name,
            String role,
            boolean active,
            long lastActivitySec,   // 실요청 경과초(-1 = 실요청 기록 없음, 하트비트만)
            long lastBeatSec,       // 최근 요청 경과초
            String lastPath) {}

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    /**
     * 인증 요청 1건 기록.
     * @param heartbeat true 면 하트비트 핑 — 접속(lastBeat)만 갱신하고 활동(lastActivity)은 갱신하지 않는다.
     */
    public void record(String userId, String name, String role, String path, boolean heartbeat) {
        if (userId == null) return;
        Instant now = Instant.now();
        entries.compute(userId, (k, e) -> {
            if (e == null) e = new Entry(userId);
            if (name != null) e.name = name;
            if (role != null) e.role = role;
            e.lastBeat = now;
            if (!heartbeat) {
                e.lastActivity = now;
                if (path != null) e.lastPath = path;
            }
            return e;
        });
    }

    /** 현재 접속(온라인 창 이내) 사용자 목록 — 최근 요청 순. 이탈자는 지연 정리. */
    public List<View> snapshot() {
        Instant now = Instant.now();
        Instant onlineFloor = now.minus(ONLINE_WINDOW);
        entries.values().removeIf(e -> e.lastBeat == null || e.lastBeat.isBefore(onlineFloor));

        List<View> list = new ArrayList<>();
        for (Entry e : entries.values()) {
            boolean active = e.lastActivity != null && e.lastActivity.isAfter(now.minus(ACTIVE_WINDOW));
            long lastActivitySec = e.lastActivity == null ? -1 : Duration.between(e.lastActivity, now).getSeconds();
            long lastBeatSec = e.lastBeat == null ? -1 : Duration.between(e.lastBeat, now).getSeconds();
            list.add(new View(e.userId, e.name, e.role, active, lastActivitySec, lastBeatSec, e.lastPath));
        }
        list.sort(Comparator.comparingLong(View::lastBeatSec));
        return list;
    }
}
