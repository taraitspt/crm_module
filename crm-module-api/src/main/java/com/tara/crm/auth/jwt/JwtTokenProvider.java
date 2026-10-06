package com.tara.crm.auth.jwt;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Slf4j
@Component
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.access-token-expiration}")
    private long accessTokenExpiration;

    private SecretKey key;

    @PostConstruct
    public void init() {
        this.key = Keys.hmacShaKeyFor(requireStrongSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generateAccessToken(String userId, String employeeNo, String name,
                                       String role, Integer companyCd, Integer plantCd, Integer deptCd) {
        return generateAccessToken(userId, employeeNo, name, role, companyCd, plantCd, deptCd, false);
    }

    /** passwordChangeRequired = 임시 비밀번호 상태. 토큰에 pwc 클레임을 실어 필터가 비밀번호 변경 외 API 를 막는다(보안 점검 M3). */
    public String generateAccessToken(String userId, String employeeNo, String name,
                                       String role, Integer companyCd, Integer plantCd, Integer deptCd,
                                       boolean passwordChangeRequired) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenExpiration);

        var b = Jwts.builder()
                .subject(userId)
                .claim("employeeNo", employeeNo)
                .claim("name", name)
                .claim("role", role)
                .claim("companyCd", companyCd)
                .claim("plantCd", plantCd)
                .claim("deptCd", deptCd);
        if (passwordChangeRequired) b = b.claim("pwc", Boolean.TRUE);
        return b.issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /** 임시 비밀번호 상태 토큰인지(pwc 클레임). */
    public boolean isPasswordChangeRequired(String token) {
        Object v = getClaims(token).get("pwc");
        return Boolean.TRUE.equals(v);
    }

    /**
     * 외부 API 클라이언트용 장기 토큰 — 일반 토큰 클레임 + apiClientId/tokenVer. 만료는 호출자가 지정(기본 365일).
     * tokenVer 가 api_client.token_version 과 다르면 ExtApiGuardFilter 가 401 로 막는다(재발급=폐기).
     */
    public String generateApiClientToken(String userId, String employeeNo, String name,
                                         String role, Integer companyCd, Integer plantCd, Integer deptCd,
                                         Long apiClientId, int tokenVersion, Date expiry) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userId)
                .claim("employeeNo", employeeNo)
                .claim("name", name)
                .claim("role", role)
                .claim("companyCd", companyCd)
                .claim("plantCd", plantCd)
                .claim("deptCd", deptCd)
                .claim("apiClientId", apiClientId)
                .claim("tokenVer", tokenVersion)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.warn("만료된 JWT 토큰: {}", e.getMessage());
        } catch (UnsupportedJwtException e) {
            log.warn("지원하지 않는 JWT 토큰: {}", e.getMessage());
        } catch (MalformedJwtException e) {
            log.warn("잘못된 형식의 JWT 토큰: {}", e.getMessage());
        } catch (SecurityException e) {
            log.warn("JWT 서명 검증 실패: {}", e.getMessage());
        } catch (IllegalArgumentException e) {
            log.warn("JWT 토큰이 비어있음: {}", e.getMessage());
        }
        return false;
    }

    public Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String getUserId(String token) {
        return getClaims(token).getSubject();
    }

    public String getRole(String token) {
        return getClaims(token).get("role", String.class);
    }

    public Integer getCompanyCd(String token) {
        Object val = getClaims(token).get("companyCd");
        return val != null ? ((Number) val).intValue() : null;
    }

    public Integer getPlantCd(String token) {
        Object val = getClaims(token).get("plantCd");
        return val != null ? ((Number) val).intValue() : null;
    }

    public Integer getDeptCd(String token) {
        Object val = getClaims(token).get("deptCd");
        return val != null ? ((Number) val).intValue() : null;
    }

    public String getName(String token) {
        return getClaims(token).get("name", String.class);
    }

    /** 사원번호(employeeNo) — user.id(로그인 아이디, subject)와 별개. 목표 salesEmpId 등과 매칭용. */
    public String getEmployeeNo(String token) {
        return getClaims(token).get("employeeNo", String.class);
    }

    /** 외부 API 클라이언트 토큰이면 클라이언트 id, 일반 로그인 토큰이면 null. */
    public Long getApiClientId(String token) {
        Object val = getClaims(token).get("apiClientId");
        return val != null ? ((Number) val).longValue() : null;
    }

    public Integer getTokenVersion(String token) {
        Object val = getClaims(token).get("tokenVer");
        return val != null ? ((Number) val).intValue() : null;
    }

    /** HS512 최소 키 길이(바이트). 이보다 짧으면 jjwt 가 WeakKeyException 을 던지지만, 그 전에 우리 말로 알려준다. */
    private static final int MIN_SECRET_BYTES = 64;

    /**
     * 비밀키가 없거나 약하면 기동을 막는다.
     * 예전엔 yml 에 폴백 키가 박혀 있어 저장소를 본 사람이면 관리자 토큰을 위조할 수 있었다.
     * 이제 키는 env JWT_SECRET 로만 들어오고, 여기서 한 번 더 확인한다.
     */
    private String requireStrongSecret() {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("JWT_SECRET 이 비어 있습니다. .env.local(로컬) 또는 운영 env 에 64바이트 이상 무작위 키를 넣으세요.");
        }
        int bytes = secret.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < MIN_SECRET_BYTES) {
            throw new IllegalStateException("JWT_SECRET 이 너무 짧습니다(" + bytes + "바이트). HS512 는 64바이트 이상이어야 합니다.");
        }
        if (secret.startsWith("CHANGE_THIS") || secret.startsWith("YTFiMmMzZDRl")) {
            throw new IllegalStateException("JWT_SECRET 이 예전 소스에 박혀 있던 기본값입니다. 새 무작위 키로 바꾸세요.");
        }
        return secret;
    }
}
