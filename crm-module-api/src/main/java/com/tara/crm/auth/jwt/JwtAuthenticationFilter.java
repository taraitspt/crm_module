package com.tara.crm.auth.jwt;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.tara.crm.common.monitor.ActiveUserRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final ActiveUserRegistry activeUserRegistry;

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = resolveToken(request);

        if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
            String userId = jwtTokenProvider.getUserId(token);
            String role = jwtTokenProvider.getRole(token);
            Integer companyCd = jwtTokenProvider.getCompanyCd(token);
            Integer plantCd = jwtTokenProvider.getPlantCd(token);
            Integer deptCd = jwtTokenProvider.getDeptCd(token);
            String name = jwtTokenProvider.getName(token);
            String employeeNo = jwtTokenProvider.getEmployeeNo(token);
            Long apiClientId = jwtTokenProvider.getApiClientId(token);   // 외부 API 클라이언트 토큰만 non-null
            Integer tokenVer = jwtTokenProvider.getTokenVersion(token);

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            userId,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                    );

            Map<String, Object> details = new HashMap<>();
            details.put("role", role);
            details.put("companyCd", companyCd);
            details.put("plantCd", plantCd);
            if (deptCd != null) {
                details.put("deptCd", deptCd);
            }
            if (name != null) {
                details.put("name", name);
            }
            if (employeeNo != null) {
                details.put("employeeNo", employeeNo);
            }
            if (apiClientId != null) {
                details.put("apiClientId", apiClientId);
                details.put("tokenVer", tokenVer);
            }
            authentication.setDetails(details);

            SecurityContextHolder.getContext().setAuthentication(authentication);
            log.debug("JWT 인증 성공 - userId: {}, role: {}, companyCd: {}, plantCd: {}", userId, role, companyCd, plantCd);

            // 임시 비밀번호 상태(pwc 클레임) — 비밀번호 변경·내 정보·로그아웃 등 /api/auth/** 와 접속 핑만 허용, 나머지는 403.
            // 프론트 ProtectedRoute 만 믿지 않는다(보안 점검 M3, 2026-10-06).
            if (jwtTokenProvider.isPasswordChangeRequired(token) && !allowedWhilePasswordChangeRequired(request.getRequestURI())) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"success\":false,\"errorCode\":\"AUTH_011\",\"message\":\"임시 비밀번호 상태입니다. 새 비밀번호를 먼저 설정하세요.\"}");
                return;
            }

            // 실시간 접속 현황 기록 — 하트비트 핑(.../active-users/ping)은 접속(lastBeat)만, 그 외는 활동(lastActivity)까지.
            // 외부 API 클라이언트(서비스 계정) 호출은 사람 접속이 아니므로 기록하지 않는다.
            if (apiClientId == null) {
                String uri = request.getRequestURI();
                boolean heartbeat = uri != null && uri.endsWith("/active-users/ping");
                activeUserRegistry.record(userId, name, role, uri, heartbeat);
            }
        }

        filterChain.doFilter(request, response);
    }

    private static boolean allowedWhilePasswordChangeRequired(String uri) {
        if (uri == null) return false;
        return uri.startsWith("/api/auth/") || uri.endsWith("/active-users/ping");
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader(AUTHORIZATION_HEADER);
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith(BEARER_PREFIX)) {
            return bearerToken.substring(BEARER_PREFIX.length());
        }
        // 대용량 파일 브라우저 네이티브 다운로드용 — 브라우저 직접 다운로드는 헤더를 못 실으므로
        // 다운로드 경로(...*/download)에 한해 ?token= 쿼리 JWT 를 허용한다. (그 외 경로는 헤더만)
        String uri = request.getRequestURI();
        if (uri != null && uri.endsWith("/download")) {
            String queryToken = request.getParameter("token");
            if (StringUtils.hasText(queryToken)) {
                return queryToken;
            }
        }
        return null;
    }
}
