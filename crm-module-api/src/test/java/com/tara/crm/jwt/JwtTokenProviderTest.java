package com.tara.crm.jwt;

import com.tara.crm.auth.jwt.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

/**
 * JWT 토큰 생성/검증 테스트 (순수 단위 테스트, Spring Context 불필요)
 */
class JwtTokenProviderTest {

    private JwtTokenProvider jwtTokenProvider;

    @BeforeEach
    void setUp() {
        jwtTokenProvider = new JwtTokenProvider();
        ReflectionTestUtils.setField(jwtTokenProvider, "secret",
                "TEST_SECRET_KEY_FOR_UNIT_TESTING_MUST_BE_AT_LEAST_256_BITS_LONG_FOR_HMAC_SHA");
        ReflectionTestUtils.setField(jwtTokenProvider, "accessTokenExpiration", 1800000L);
        jwtTokenProvider.init();
    }

    @Test
    @DisplayName("액세스 토큰 생성 성공")
    void generateAccessToken() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 1000, 1000, 1000);

        assertNotNull(token);
        assertFalse(token.isEmpty());
    }

    @Test
    @DisplayName("토큰 검증 - 유효한 토큰")
    void validateToken_valid() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 1000, 1000, 1100);

        assertTrue(jwtTokenProvider.validateToken(token));
    }

    @Test
    @DisplayName("토큰 검증 - 잘못된 토큰")
    void validateToken_invalid() {
        assertFalse(jwtTokenProvider.validateToken("invalid.token.value"));
    }

    @Test
    @DisplayName("토큰에서 userId 추출")
    void getUserId() {
        String token = jwtTokenProvider.generateAccessToken(
                "testuser", "EMP002", "테스트", "STAFF", 1000, 1000, 1200);

        assertEquals("testuser", jwtTokenProvider.getUserId(token));
    }

    @Test
    @DisplayName("토큰에서 role 추출")
    void getRole() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 1000, 1000, 1000);

        assertEquals("ADMIN", jwtTokenProvider.getRole(token));
    }

    @Test
    @DisplayName("토큰에서 companyCd 추출")
    void getCompanyCd() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 2000, 1000, 1000);

        assertEquals(2000, jwtTokenProvider.getCompanyCd(token));
    }

    @Test
    @DisplayName("토큰에서 plantCd 추출")
    void getPlantCd() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 1000, 3000, 1000);

        assertEquals(3000, jwtTokenProvider.getPlantCd(token));
    }

    @Test
    @DisplayName("토큰에서 deptCd 추출")
    void getDeptCd() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 1000, 1000, 1100);

        assertEquals(1100, jwtTokenProvider.getDeptCd(token));
    }

    @Test
    @DisplayName("토큰 Claims에 모든 필드 포함 확인")
    void getClaims_containsAll() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 1000, 1000, 1100);

        Claims claims = jwtTokenProvider.getClaims(token);

        assertEquals("admin", claims.getSubject());
        assertEquals("ADMIN", claims.get("role", String.class));
        assertEquals(1000, claims.get("companyCd", Integer.class));
        assertEquals(1000, claims.get("plantCd", Integer.class));
        assertEquals(1100, claims.get("deptCd", Integer.class));
    }

    @Test
    @DisplayName("deptCd가 null일 때 토큰 생성/검증 정상 동작")
    void generateToken_nullDeptCd() {
        String token = jwtTokenProvider.generateAccessToken(
                "admin", "EMP001", "관리자", "ADMIN", 1000, 1000, null);

        assertTrue(jwtTokenProvider.validateToken(token));
        assertNull(jwtTokenProvider.getDeptCd(token));
    }
}
