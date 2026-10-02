package com.tara.crm.push.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

public class PushDto {

    /** 브라우저 PushSubscription.toJSON() 을 그대로 — endpoint + keys.p256dh + keys.auth. */
    @Getter
    @Setter
    @NoArgsConstructor
    public static class SubscribeRequest {
        @NotBlank
        private String endpoint;
        @NotBlank
        private String p256dh;
        @NotBlank
        private String auth;
        private String userAgent;
    }

    @Getter
    @AllArgsConstructor
    public static class VapidKey {
        /** 서버가 웹 푸시를 보낼 수 있게 설정됐는지(VAPID 키 있음). false 면 화면은 알림 켜기를 숨긴다. */
        private final boolean enabled;
        private final String publicKey;
    }

    @Getter
    @AllArgsConstructor
    public static class Count {
        private final long count;
    }
}
