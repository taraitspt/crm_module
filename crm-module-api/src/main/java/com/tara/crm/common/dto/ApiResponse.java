package com.tara.crm.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 공통 API 응답 래퍼.
 * 모든 REST API는 이 형식으로 응답한다.
 */
@Getter
@Builder
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private final boolean success;
    private final T data;
    private final String message;
    private final String errorCode;

    @Builder.Default
    private final LocalDateTime timestamp = LocalDateTime.now();

    // 성공 응답 (데이터 포함)
    public static <T> ApiResponse<T> ok(T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .build();
    }

    // 성공 응답 (메시지 포함)
    public static <T> ApiResponse<T> ok(T data, String message) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .message(message)
                .build();
    }

    // 성공 응답 (데이터 없음)
    public static ApiResponse<Void> ok() {
        return ApiResponse.<Void>builder()
                .success(true)
                .build();
    }

    // 실패 응답
    public static <T> ApiResponse<T> error(String errorCode, String message) {
        return ApiResponse.<T>builder()
                .success(false)
                .errorCode(errorCode)
                .message(message)
                .build();
    }
}
