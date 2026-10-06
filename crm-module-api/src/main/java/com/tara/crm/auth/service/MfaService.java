package com.tara.crm.auth.service;

import com.tara.crm.auth.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.internet.MimeMessage;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

/** 시트 #1 — 2차인증(이메일 OTP). 로그인 1차 통과 후 6자리 코드 이메일 발송 → /auth/mfa/verify.
 *  In-memory cache 사용 (5분 만료). multi-instance 환경 도입 시 Redis 또는 DB 로 이동 검토. */
@Slf4j
@Service
@RequiredArgsConstructor
public class MfaService {

    private final ObjectProvider<JavaMailSender> mailSenderProvider;

    @Value("${spring.mail.username:noreply@tara.local}")
    private String mailFrom;

    private static final long TTL_SECONDS = 300L;
    /** challenge 당 코드 입력 허용 횟수 — 넘기면 폐기해 6자리 무차별 대입을 막는다(보안 점검 H3, 2026-10-06). */
    private static final int MAX_ATTEMPTS = 5;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();

    public String issueChallenge(User user) {
        String challengeToken = UUID.randomUUID().toString();
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        Instant expiry = Instant.now().plusSeconds(TTL_SECONDS);
        challenges.put(challengeToken, new Challenge(user.getEmployeeNo(),
                user.getId().getCompanyCd(), code, expiry, new java.util.concurrent.atomic.AtomicInteger()));
        if (!sendOtpEmail(user, code)) {
            // 코드를 못 보냈으면 challenge 도 남기지 않는다 — 받지도 못한 코드를 맞히는 시도 자체를 없앤다.
            challenges.remove(challengeToken);
            throw new com.tara.crm.common.exception.BusinessException(com.tara.crm.common.exception.ErrorCode.INTERNAL_SERVER_ERROR,
                    "2차인증 코드를 보내지 못했습니다. 이메일(Teams 계정) 등록 여부를 확인하거나 IT지원팀으로 문의하세요.");
        }
        log.info("MFA challenge 발급 — empNo={}, expiry={}", user.getEmployeeNo(), expiry);
        return challengeToken;
    }

    /** challenge + code 검증. 성공 시 (employeeNo, companyCd) 반환, 실패 시 null. */
    public Challenge verify(String challengeToken, String code) {
        if (challengeToken == null || code == null) return null;
        Challenge c = challenges.get(challengeToken);
        if (c == null) return null;
        if (Instant.now().isAfter(c.expiry)) {
            challenges.remove(challengeToken);
            return null;
        }
        if (!java.security.MessageDigest.isEqual(c.code.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                                                 code.getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            if (c.attempts.incrementAndGet() >= MAX_ATTEMPTS) {
                challenges.remove(challengeToken);
                log.warn("MFA challenge 폐기 — 코드 {}회 연속 오류 (empNo={})", MAX_ATTEMPTS, c.employeeNo);
            }
            return null;
        }
        challenges.remove(challengeToken);  // 1회용 — 검증 즉시 제거
        return c;
    }

    /** 유효한 challenge 가 남아 있는지 — 횟수 초과·만료로 폐기됐으면 false(컨트롤러가 "다시 로그인" 안내). */
    public boolean exists(String challengeToken) {
        return challengeToken != null && challenges.containsKey(challengeToken);
    }

    /** @return 발송 성공 여부 */
    private boolean sendOtpEmail(User user, String code) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            log.warn("MFA OTP — JavaMailSender 미설정. 코드 미발송 (empNo={}).", user.getEmployeeNo());
            return false;
        }
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            log.warn("MFA OTP — 사용자 email 없음 (empNo={}). 코드 미발송.", user.getEmployeeNo());
            return false;
        }
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, false, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(user.getEmail());
            helper.setSubject("[TARA TPS CRM] 2차인증 코드");
            helper.setText("로그인 2차인증 코드: " + code + "\n\n5분 이내에 입력해주세요.", false);
            mailSender.send(msg);
            log.info("MFA OTP 발송 완료 — empNo={}, email={}", user.getEmployeeNo(), user.getEmail());
            return true;
        } catch (Exception e) {
            log.error("MFA OTP 발송 실패 — empNo={}: {}", user.getEmployeeNo(), e.getMessage());
            return false;
        }
    }

    public record Challenge(String employeeNo, Integer companyCd, String code, Instant expiry,
                            java.util.concurrent.atomic.AtomicInteger attempts) {}
}
