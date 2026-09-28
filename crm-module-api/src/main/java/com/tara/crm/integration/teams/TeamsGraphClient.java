package com.tara.crm.integration.teams;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Microsoft Graph 로 Teams 1:1 채팅 메시지(DM)를 보내는 클라이언트.
 *
 * 방식(sales-dashboard 포털과 동일):
 *   1) 서비스계정 자격증명(ROPC, grant_type=password)으로 위임 토큰 발급 — scope: Chat.Create Chat.ReadWrite
 *   2) GET /me 로 서비스계정 자신의 userId 확보
 *   3) POST /chats (oneOnOne, 서비스계정↔수신자) 로 1:1 채팅 생성(이미 있으면 기존 채팅 반환)
 *   4) POST /chats/{id}/messages 로 HTML 메시지 전송
 *
 * 자격증명(msgraph.*)이 비어 있으면 isConfigured()=false. 호출부가 이를 확인하고 처리한다.
 * (임시비번은 Teams 전송 성공을 확인한 뒤에만 저장하므로, 미설정/실패 시 계정이 잠기지 않는다.)
 */
@Component
@Slf4j
public class TeamsGraphClient {

    @Value("${msgraph.tenant-id:}")
    private String tenantId;
    @Value("${msgraph.client-id:}")
    private String clientId;
    @Value("${msgraph.username:}")
    private String username;
    @Value("${msgraph.password:}")
    private String password;

    private volatile String cachedToken;
    private volatile long tokenExpiryMs;

    public boolean isConfigured() {
        return StringUtils.hasText(tenantId) && StringUtils.hasText(clientId)
                && StringUtils.hasText(username) && StringUtils.hasText(password);
    }

    /**
     * 기동 시 설정 여부를 한 줄 남긴다 — "비밀번호 분실이 안 된다" 를 로그 첫 줄에서 바로 가려내기 위해.
     * 값은 찍지 않고 어느 키가 비었는지만 알려준다.
     */
    @PostConstruct
    void logConfigured() {
        if (isConfigured()) {
            log.info("[teams] MS Graph 설정됨 — 비밀번호 분실 시 Teams DM 전송 가능");
            return;
        }
        java.util.List<String> missing = new java.util.ArrayList<>();
        if (!StringUtils.hasText(tenantId)) missing.add("MS_TENANT_ID");
        if (!StringUtils.hasText(clientId)) missing.add("MS_CLIENT_ID");
        if (!StringUtils.hasText(username)) missing.add("MS_USERNAME");
        if (!StringUtils.hasText(password)) missing.add("MS_PASSWORD");
        log.warn("[teams] MS Graph 미설정 — 비밀번호 분실(Teams DM) 이 동작하지 않는다. 비어 있는 키: {} (.env.local 확인)", missing);
    }

    /** 트랜잭션 안에서 호출되므로 hang 방지 위해 연결/응답 타임아웃을 건다. */
    private static SimpleClientHttpRequestFactory timeoutFactory() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(10_000);
        f.setReadTimeout(15_000);
        return f;
    }

    /** 위임 토큰(ROPC). 만료 10분 전까지 캐시 재사용. */
    private synchronized String getToken() {
        long now = System.currentTimeMillis();
        if (cachedToken != null && now < tokenExpiryMs) return cachedToken;

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("client_id", clientId);
        form.add("username", username);
        form.add("password", password);
        form.add("scope", "Chat.Create Chat.ReadWrite");

        @SuppressWarnings("unchecked")
        Map<String, Object> res = RestClient.builder().requestFactory(timeoutFactory()).build()
                .post()
                .uri("https://login.microsoftonline.com/" + tenantId + "/oauth2/v2.0/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(Map.class);

        Object token = res != null ? res.get("access_token") : null;
        if (token == null) {
            throw new IllegalStateException("MS Graph 토큰 발급 실패: " + res);
        }
        cachedToken = token.toString();
        tokenExpiryMs = now + 50L * 60 * 1000;   // 실제 만료(약 60~90분)보다 보수적으로
        return cachedToken;
    }

    private RestClient graph() {
        return RestClient.builder()
                .requestFactory(timeoutFactory())
                .baseUrl("https://graph.microsoft.com/v1.0")
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + getToken())
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    /**
     * 수신자(AAD 이메일)에게 Teams 1:1 채팅으로 HTML 메시지 전송.
     * 실패 시 예외를 던진다(호출부에서 '전송 실패'로 처리).
     */
    public void sendToUser(String recipientEmail, String htmlContent) {
        if (!isConfigured()) {
            throw new IllegalStateException("MS Graph(msgraph.*) 미설정 — Teams 전송 불가");
        }
        if (!StringUtils.hasText(recipientEmail)) {
            throw new IllegalStateException("수신자 이메일이 없어 Teams 전송 불가");
        }
        RestClient graph = graph();

        @SuppressWarnings("unchecked")
        Map<String, Object> me = graph.get().uri("/me").retrieve().body(Map.class);
        Object meId = me != null ? me.get("id") : null;
        if (meId == null) throw new IllegalStateException("MS Graph /me 조회 실패");

        Map<String, Object> chatBody = Map.of(
                "chatType", "oneOnOne",
                "members", List.of(
                        Map.of("@odata.type", "#microsoft.graph.aadUserConversationMember",
                                "roles", List.of("owner"),
                                "user@odata.bind", "https://graph.microsoft.com/v1.0/users/" + meId),
                        Map.of("@odata.type", "#microsoft.graph.aadUserConversationMember",
                                "roles", List.of("owner"),
                                "user@odata.bind", "https://graph.microsoft.com/v1.0/users/" + recipientEmail)
                )
        );
        @SuppressWarnings("unchecked")
        Map<String, Object> chat = graph.post().uri("/chats").body(chatBody).retrieve().body(Map.class);
        Object chatId = chat != null ? chat.get("id") : null;
        if (chatId == null) throw new IllegalStateException("Teams 채팅 생성 실패");

        graph.post().uri("/chats/{id}/messages", chatId)
                .body(Map.of("body", Map.of("contentType", "html", "content", htmlContent)))
                .retrieve()
                .toBodilessEntity();

        log.info("Teams 메시지 전송 완료 — recipient={}", recipientEmail);
    }

    /** Sends HTML to an existing Teams chat. The service account must be a chat member. */
    public void sendToChat(String chatId, String htmlContent) {
        if (!isConfigured()) {
            throw new IllegalStateException("MS Graph(msgraph.*) is not configured");
        }
        if (!StringUtils.hasText(chatId)) {
            throw new IllegalArgumentException("Teams chat id is required");
        }
        graph().post().uri("/chats/{id}/messages", chatId)
                .body(Map.of("body", Map.of("contentType", "html", "content", htmlContent)))
                .retrieve()
                .toBodilessEntity();
        log.info("Teams chat message sent: chatId={}", chatId);
    }
}
