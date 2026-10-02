package com.tara.crm.push.service;

import com.tara.crm.push.dto.PushDto;
import com.tara.crm.push.entity.PushSubscription;
import com.tara.crm.push.repository.PushSubscriptionRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.apache.http.HttpResponse;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.Security;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 웹 푸시(VAPID) — 아이폰 홈 화면 웹앱(PWA)·브라우저에 활동 알림을 보낸다. 무료: Apple/Google 푸시 서비스에 표준 Web Push 로 전달.
 *
 * 키는 환경변수(WEBPUSH_PUBLIC_KEY / WEBPUSH_PRIVATE_KEY / WEBPUSH_SUBJECT)로만 주입한다 — 한 번 만든 키를 계속 써야
 * 기존 구독이 유효하다(키를 바꾸면 모든 폰이 알림을 다시 허용해야 한다). 생성: `npx web-push generate-vapid-keys`.
 * 구독은 도메인(서비스워커 출처)에 묶이므로 서버 주소가 바뀌어도 재허용이 필요하다.
 * 발송 결과가 404/410 이면 해지·만료된 구독이라 지우고, 그 외 실패는 fail_count 만 올린다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WebPushService {

    private final PushSubscriptionRepository repository;

    @Value("${webpush.public-key:}")
    private String publicKey;
    @Value("${webpush.private-key:}")
    private String privateKey;
    @Value("${webpush.subject:mailto:crm@taratps.com}")
    private String subject;

    private PushService pushService;

    @PostConstruct
    void init() {
        if (!isConfigured()) {
            log.warn("[webpush] VAPID 키 미설정 — 아이폰/브라우저 활동 알림(웹 푸시)이 동작하지 않는다. .env.local 에 WEBPUSH_PUBLIC_KEY / WEBPUSH_PRIVATE_KEY 를 넣으세요.");
            return;
        }
        try {
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(new BouncyCastleProvider());
            }
            pushService = new PushService(publicKey, privateKey, subject);
            log.info("[webpush] VAPID 설정됨 — 활동 알림 웹 푸시 가능");
        } catch (Exception e) {
            log.error("[webpush] PushService 초기화 실패 — 키 형식을 확인하세요", e);
            pushService = null;
        }
    }

    public boolean isConfigured() {
        return StringUtils.hasText(publicKey) && StringUtils.hasText(privateKey);
    }

    public PushDto.VapidKey vapidKey() {
        return new PushDto.VapidKey(pushService != null, pushService != null ? publicKey : null);
    }

    /** 구독 등록 — 같은 endpoint 가 있으면(재등록·다른 사용자 로그인) 그 행을 덮어쓴다. */
    @Transactional
    public void subscribe(Integer companyCd, String userId, PushDto.SubscribeRequest req) {
        PushSubscription s = repository.findByEndpoint(req.getEndpoint()).orElseGet(() ->
                PushSubscription.builder().companyCd(companyCd).userId(userId).endpoint(req.getEndpoint()).build());
        s.setCompanyCd(companyCd);
        s.setUserId(userId);
        s.setP256dh(req.getP256dh());
        s.setAuthKey(req.getAuth());
        s.setUserAgent(req.getUserAgent() == null ? null : req.getUserAgent().substring(0, Math.min(300, req.getUserAgent().length())));
        s.setFailCount(0);
        repository.save(s);
    }

    @Transactional
    public void unsubscribe(String endpoint) {
        repository.deleteByEndpoint(endpoint);
    }

    public long countMine(Integer companyCd, String userId) {
        return repository.countByCompanyCdAndUserId(companyCd, userId);
    }

    /** 한 사용자의 모든 구독에 알림 1건 — 보낸 구독 수를 돌려준다. url 은 알림을 눌렀을 때 열 화면. */
    @Transactional
    public int sendToUser(Integer companyCd, String userId, String title, String body, String url, String tag) {
        if (pushService == null) return 0;
        List<PushSubscription> subs = repository.findByCompanyCdAndUserId(companyCd, userId);
        String payload = json(title, body, url, tag);
        int sent = 0;
        for (PushSubscription s : subs) if (send(s, payload)) sent++;
        return sent;
    }

    /** 구독 목록이 이미 있을 때(스케줄러) — 같은 payload 를 여러 구독에. */
    @Transactional
    public int send(List<PushSubscription> subs, String title, String body, String url, String tag) {
        if (pushService == null) return 0;
        String payload = json(title, body, url, tag);
        int sent = 0;
        for (PushSubscription s : subs) if (send(s, payload)) sent++;
        return sent;
    }

    private boolean send(PushSubscription s, String payload) {
        try {
            Notification n = new Notification(s.getEndpoint(), s.getP256dh(), s.getAuthKey(), payload.getBytes(StandardCharsets.UTF_8));
            HttpResponse res = pushService.send(n);
            int status = res.getStatusLine().getStatusCode();
            if (status == 404 || status == 410) {
                log.info("[webpush] 구독 만료/해지(HTTP {}) — 삭제 user={}", status, s.getUserId());
                repository.delete(s);
                return false;
            }
            if (status >= 200 && status < 300) {
                s.setLastSentAt(LocalDateTime.now());
                s.setFailCount(0);
                repository.save(s);
                return true;
            }
            s.setFailCount(s.getFailCount() + 1);
            repository.save(s);
            log.warn("[webpush] 발송 실패 HTTP {} user={} fail={}", status, s.getUserId(), s.getFailCount());
            return false;
        } catch (Exception e) {
            s.setFailCount(s.getFailCount() + 1);
            repository.save(s);
            log.warn("[webpush] 발송 예외 user={} fail={} — {}", s.getUserId(), s.getFailCount(), e.toString());
            return false;
        }
    }

    /** 서비스워커(push-sw.js)가 읽는 payload — title/body/url/tag. */
    private static String json(String title, String body, String url, String tag) {
        return "{\"title\":" + q(title) + ",\"body\":" + q(body) + ",\"url\":" + q(url) + ",\"tag\":" + q(tag) + "}";
    }

    private static String q(String v) {
        if (v == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : v.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> { if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c); }
            }
        }
        return sb.append('"').toString();
    }
}
