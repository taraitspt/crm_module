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
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Map<String, Challenge> challenges = new ConcurrentHashMap<>();

    public String issueChallenge(User user) {
        String challengeToken = UUID.randomUUID().toString();
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        Instant expiry = Instant.now().plusSeconds(TTL_SECONDS);
        challenges.put(challengeToken, new Challenge(user.getEmployeeNo(),
                user.getId().getCompanyCd(), code, expiry));
        sendOtpEmail(user, code);
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
        if (!c.code.equals(code)) return null;
        challenges.remove(challengeToken);  // 1회용 — 검증 즉시 제거
        return c;
    }

    private void sendOtpEmail(User user, String code) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            log.warn("MFA OTP — JavaMailSender 미설정. 코드 미발송 (empNo={}).", user.getEmployeeNo());
            return;
        }
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            log.warn("MFA OTP — 사용자 email 없음 (empNo={}). 코드 미발송.", user.getEmployeeNo());
            return;
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
        } catch (Exception e) {
            log.error("MFA OTP 발송 실패 — empNo={}: {}", user.getEmployeeNo(), e.getMessage());
        }
    }

    public record Challenge(String employeeNo, Integer companyCd, String code, Instant expiry) {}
}
