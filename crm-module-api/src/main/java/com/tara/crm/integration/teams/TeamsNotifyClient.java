package com.tara.crm.integration.teams;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Teams 1:1 메시지(DM) — IT지원팀 공용 API(tara-common-api) {@code POST /api/notify/teams} 로 보낸다(2026-10-14 전환).
 * 예전엔 MS Graph 를 서비스계정(ROPC)으로 직접 불렀다(TeamsGraphClient) — 이제 MS 계정 없이 API 키 하나로 보낸다.
 *
 * <ul>
 *   <li>인증: 헤더 {@code X-Api-Key} — env {@code TARA_NOTIFY_API_KEY}. 키는 등록된 서버 IP 에서만 동작한다
 *       (운영 52.78.211.240, 로컬에서 시험하려면 그 PC 의 공인 IP 도 등록 필요).</li>
 *   <li>본문은 <b>일반 텍스트</b>(줄바꿈 유지, HTML 은 글자 그대로 보임). 모양은 공용 API 의 표준 틀이 정한다
 *       — 이모지 제목·강조값·안내문·버튼은 {@link Message} 칸으로 나눠 보낸다(2026-10-15).</li>
 *   <li>받는 사람은 회사 메일(@taratps.com)만 — 아니면 403 NOTIFY_FORBIDDEN.</li>
 *   <li>여러 명이면 사람마다 성공/실패가 갈린다(200 + results). 여기선 한 명씩 보내고 그 사람 결과를 확인한다.</li>
 * </ul>
 * 키가 비어 있으면 {@link #isConfigured()} = false — 호출부가 확인한다.
 */
@Component
@Slf4j
public class TeamsNotifyClient {

    @Value("${tara.notify.base-url:https://api.taratps.com}")
    private String baseUrl;
    @Value("${tara.notify.api-key:}")
    private String apiKey;

    public boolean isConfigured() {
        return StringUtils.hasText(baseUrl) && StringUtils.hasText(apiKey);
    }

    /** 기동 시 설정 여부만 한 줄 — 키 값은 찍지 않는다. */
    @PostConstruct
    void logConfigured() {
        if (isConfigured()) log.info("[teams] 공용 알림 API 설정됨 — {}", baseUrl);
        else log.warn("[teams] 공용 알림 API 키(TARA_NOTIFY_API_KEY) 미설정 — 비밀번호 분실(Teams DM) 이 동작하지 않는다");
    }

    /** 발송은 동기 처리라 느릴 수 있다 — 정의서 권장대로 응답 타임아웃 60초. */
    private RestClient client() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(10_000);
        f.setReadTimeout(60_000);
        return RestClient.builder()
                .requestFactory(f)
                .baseUrl(baseUrl)
                .defaultHeader("X-Api-Key", apiKey)
                .build();
    }

    /**
     * 한 사람에게 Teams DM. 실패하면 {@link TeamsNotifyException} — 메시지는 사용자에게 보여줘도 되는 문장.
     *
     * @param email   받는 사람 회사 메일(@taratps.com)
     * @param title   제목(굵게, 100자 이내) — 없으면 null
     * @param message 본문(일반 텍스트, 2,000자 이내)
     * @param link    "바로가기" URL(http/https) — 없으면 null
     */
    public void sendToUser(String email, String title, String message, String link) {
        sendToUser(email, Message.of(title, message).link(link, null));
    }

    /**
     * 공용 API 표준 알림 틀 — [이모지 제목] → 본문 → [강조값 크게] → 안내문(작게) → [링크 버튼].
     * 비어 있는 칸은 보내지 않는다(공용 API 가 그 칸을 빼고 그린다).
     *
     * @param icon      제목 앞 이모지(예: 🔑) — null 이면 공용 API 기본(🔔)
     * @param title     제목(100자)
     * @param message   본문(일반 텍스트, 2,000자)
     * @param highlight 크게 보일 값 — 임시 비밀번호·인증번호 등(100자)
     * @param note      맨 아래 작은 회색 안내문(500자)
     * @param link      버튼 URL(http/https)
     * @param linkText  버튼 문구(30자) — null 이면 "바로가기"
     */
    public record Message(String icon, String title, String message, String highlight, String note,
                          String link, String linkText) {
        public static Message of(String title, String message) {
            return new Message(null, title, message, null, null, null, null);
        }
        public Message icon(String icon) { return new Message(icon, title, message, highlight, note, link, linkText); }
        public Message highlight(String v) { return new Message(icon, title, message, v, note, link, linkText); }
        public Message note(String v) { return new Message(icon, title, message, highlight, v, link, linkText); }
        public Message link(String url, String text) { return new Message(icon, title, message, highlight, note, url, text); }
    }

    public void sendToUser(String email, Message m) {
        if (!isConfigured()) throw new TeamsNotifyException("Teams 알림 설정(API 키)이 없어 보낼 수 없습니다.");
        if (!StringUtils.hasText(email)) throw new TeamsNotifyException("받는 사람 이메일이 없어 Teams 로 보낼 수 없습니다.");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("to", List.of(email.trim()));
        putIfText(body, "icon", m.icon());
        putIfText(body, "title", m.title());
        body.put("message", m.message());
        putIfText(body, "highlight", m.highlight());
        putIfText(body, "note", m.note());
        putIfText(body, "link", m.link());
        putIfText(body, "linkText", m.linkText());

        Map<?, ?> res;
        try {
            res = client().post().uri("/api/notify/teams")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);
        } catch (RestClientResponseException e) {
            // 오류 응답: {"success": false, "code": "...", "message": "..."} — 코드만 남기고 키·본문은 찍지 않는다.
            String code = errorCode(e.getResponseBodyAsString());
            log.warn("[teams] 발송 거절 — HTTP {} {}", e.getStatusCode().value(), code);
            throw new TeamsNotifyException(userMessage(code), e);
        } catch (Exception e) {
            log.warn("[teams] 알림 서버 호출 실패 — {}", e.toString());
            throw new TeamsNotifyException("Teams 알림 서버에 연결하지 못했습니다.", e);
        }

        // 200 이어도 사람별 결과를 본다 — 계정을 못 찾으면 그 사람만 실패로 온다.
        Object data = res != null ? res.get("data") : null;
        Object results = data instanceof Map<?, ?> d ? d.get("results") : null;
        if (results instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> r) {
            if (!Boolean.TRUE.equals(r.get("success"))) {
                log.warn("[teams] 받는 사람 실패 — {}: {}", email, r.get("error"));
                throw new TeamsNotifyException("Teams 에서 받는 사람을 찾지 못했습니다(" + r.get("error") + ").");
            }
            log.info("[teams] 발송 완료 — {}", email);
            return;
        }
        throw new TeamsNotifyException("Teams 알림 서버 응답을 확인하지 못했습니다.");
    }

    private static void putIfText(Map<String, Object> body, String key, String value) {
        if (StringUtils.hasText(value)) body.put(key, value);
    }

    private static String errorCode(String json) {
        if (json == null) return "";
        int i = json.indexOf("\"code\"");
        if (i < 0) return "";
        int s = json.indexOf('"', json.indexOf(':', i) + 1);
        int e = s < 0 ? -1 : json.indexOf('"', s + 1);
        return s >= 0 && e > s ? json.substring(s + 1, e) : "";
    }

    /** 정의서 오류 코드 → 화면 문구. */
    private static String userMessage(String code) {
        return switch (code) {
            case "NOTIFY_FORBIDDEN" -> "회사 Teams 메일(@taratps.com)이 아니라 Teams 로 보낼 수 없습니다.";
            case "NOTIFY_RATE_LIMIT" -> "Teams 발송이 잠시 몰렸습니다. 1분 뒤 다시 시도해 주세요.";
            case "API_KEY_INVALID", "API_KEY_FORBIDDEN" -> "Teams 알림 연동 설정 문제로 보낼 수 없습니다.";
            case "NOTIFY_UNAVAILABLE" -> "Teams 알림 서버를 지금 쓸 수 없습니다.";
            default -> "Teams 메시지를 보내지 못했습니다.";
        };
    }

    /** 발송 실패 — getMessage() 는 사용자에게 보여줄 수 있는 문장. */
    public static class TeamsNotifyException extends RuntimeException {
        public TeamsNotifyException(String message) { super(message); }
        public TeamsNotifyException(String message, Throwable cause) { super(message, cause); }
    }
}
