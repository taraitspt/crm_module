package com.tara.crm.dto;

import com.tara.crm.common.dto.ApiResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ApiResponse 유틸리티 테스트
 */
class ApiResponseTest {

    @Test
    @DisplayName("ApiResponse.ok - 성공 응답 생성")
    void ok() {
        ApiResponse<String> response = ApiResponse.ok("hello");

        assertTrue(response.isSuccess());
        assertEquals("hello", response.getData());
        assertNull(response.getErrorCode());
        assertNotNull(response.getTimestamp());
    }

    @Test
    @DisplayName("ApiResponse.error - 에러 응답 생성")
    void error() {
        ApiResponse<Void> response = ApiResponse.error("ERR_001", "에러 메시지");

        assertFalse(response.isSuccess());
        assertNull(response.getData());
        assertEquals("ERR_001", response.getErrorCode());
        assertEquals("에러 메시지", response.getMessage());
    }
}
