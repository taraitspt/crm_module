package com.tara.crm.auth.service;

import com.tara.crm.auth.dto.LoginRequest;
import com.tara.crm.auth.dto.TokenResponse;
import com.tara.crm.auth.dto.UserResponse;
import com.tara.crm.auth.entity.AuthEventType;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.jwt.JwtTokenProvider;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.id.DepartmentId;
import com.tara.crm.common.id.UserId;
import com.tara.crm.integration.teams.TeamsGraphClient;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final MfaService mfaService;
    private final AuthHistoryService authHistoryService;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final TeamsGraphClient teamsGraphClient;

    @Value("${spring.mail.username:noreply@tara.local}")
    private String mailFrom;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String TEMP_PWD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

    /** 비밀번호 분실 연속 발급 방지(같은 ID 재발급 쿨다운). 프로세스 메모리 — 재기동 시 초기화. */
    private static final long RESET_COOLDOWN_MS = 3 * 60 * 1000L;
    private final Map<String, Long> lastResetAtByLoginId = new ConcurrentHashMap<>();

    /** 잠금 기준 — application.yml auth.lockout.* (env 로 조정 가능) */
    @Value("${auth.lockout.max-failures:5}")
    private int lockoutMaxFailures;

    @Value("${auth.lockout.lock-minutes:30}")
    private int lockoutMinutes;

    /**
     * 로그인.
     * 실패 횟수·잠금·이력은 예외를 던지는 경우에 남겨야 하는 것이라, BusinessException 으로는 롤백하지 않는다.
     */
    @Transactional(noRollbackFor = BusinessException.class)
    public TokenResponse login(LoginRequest request) {
        Integer companyCd = request.getCompanyCd() != null ? request.getCompanyCd() : 1000;

        // 로그인 식별자 = users.id (ERP CI_USER_MST.USER_ID). 사번(employee_no) 아님.
        // 없는 계정도 같은 메시지 — 사번이 존재하는지 알려주지 않는다.
        User user = userRepository.findByCompanyCdAndUserId(companyCd, request.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));

        if (!user.isActive()) {
            throw new BusinessException(ErrorCode.USER_INACTIVE);
        }

        // 잠긴 동안은 비밀번호가 맞아도 들여보내지 않는다 — 맞는 비밀번호를 찾았는지 확인시켜 주는 꼴이 된다.
        if (user.isLockedNow()) {
            long minutesLeft = Math.max(1,
                    java.time.Duration.between(java.time.LocalDateTime.now(), user.getLockedUntil()).toMinutes() + 1);
            authHistoryService.record(user, AuthEventType.LOGIN_FAILED);
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED,
                    "비밀번호를 " + lockoutMaxFailures + "회 연속 틀려 계정이 잠겼습니다. "
                    + minutesLeft + "분 후 다시 시도하거나, [비밀번호 분실]로 임시 비밀번호를 받으면 바로 풀립니다.");
        }

        // 첫 로그인 대기 계정(ERP 동기화 신규·옛 공통 초기 비밀번호) — 어떤 비밀번호를 넣어도 여기서 막는다(실패 횟수도 안 센다).
        // [비밀번호 분실]로 Teams 1회용 비밀번호를 받으면 플래그가 풀린다(보안 점검 C1, 2026-10-06).
        if (Boolean.TRUE.equals(user.getInitialLoginPending())) {
            throw new BusinessException(ErrorCode.INITIAL_PASSWORD_REQUIRED);
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            boolean lockedNow = user.recordLoginFailure(lockoutMaxFailures, lockoutMinutes);
            userRepository.save(user);
            authHistoryService.record(user, lockedNow ? AuthEventType.LOCKED : AuthEventType.LOGIN_FAILED);
            if (lockedNow) {
                log.warn("계정 잠금 — userId={}, 연속 실패 {}회", user.getId().getId(), user.getFailedLoginCount());
                throw new BusinessException(ErrorCode.ACCOUNT_LOCKED,
                        "비밀번호를 " + lockoutMaxFailures + "회 연속 틀려 계정이 " + lockoutMinutes + "분간 잠겼습니다. "
                        + "[비밀번호 분실]로 임시 비밀번호를 받으면 바로 풀립니다.");
            }
            int remaining = lockoutMaxFailures - user.getFailedLoginCount();
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS,
                    ErrorCode.INVALID_CREDENTIALS.getMessage()
                    + " (" + remaining + "회 더 틀리면 " + lockoutMinutes + "분간 잠깁니다)");
        }

        // 비밀번호가 맞았다 — 남아 있던 실패 기록은 지운다. (MFA 로 넘어가더라도 1차 인증은 성공한 것)
        if ((user.getFailedLoginCount() != null && user.getFailedLoginCount() > 0) || user.getLockedUntil() != null) {
            user.clearLoginFailures();
            userRepository.save(user);
        }

        // 시트 #1 — 2차인증 활성 사용자는 OTP challenge 발급 후 /auth/mfa/verify 로 분기.
        if (Boolean.TRUE.equals(user.getMfaEnabled())) {
            String challenge = mfaService.issueChallenge(user);
            log.info("1차 인증 통과 — MFA challenge 발급 (empNo={})", user.getEmployeeNo());
            return TokenResponse.builder()
                    .mfaRequired(true)
                    .mfaChallenge(challenge)
                    .tokenType("Bearer")
                    .build();
        }

        return issueAccessToken(user);
    }

    /** MFA 검증 통과 후 정식 accessToken 발급. */
    @Transactional
    public TokenResponse verifyMfa(String challengeToken, String code) {
        MfaService.Challenge c = mfaService.verify(challengeToken, code);
        if (c == null) {
            // 5회 초과·만료로 폐기된 challenge 면 "다시 로그인" 안내, 아직 살아 있으면 코드 오류(H3).
            if (!mfaService.exists(challengeToken)) throw new BusinessException(ErrorCode.MFA_CHALLENGE_EXPIRED);
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, "인증 코드가 올바르지 않습니다.");
        }
        User user = userRepository.findByCompanyCdAndEmployeeNo(c.companyCd(), c.employeeNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        return issueAccessToken(user);
    }

    private TokenResponse issueAccessToken(User user) {
        String accessToken = jwtTokenProvider.generateAccessToken(
                user.getId().getId(),
                user.getEmployeeNo(),
                user.getName(),
                user.getRole().name(),
                user.getId().getCompanyCd(),
                2000, // plantCd — PO/Order 테이블 MySQL 저장 기준값
                user.getDeptCd(),
                Boolean.TRUE.equals(user.getMustChangePassword())   // pwc 클레임 — 서버 필터가 비밀번호 변경 외 API 를 막는다(M3)
        );
        log.info("로그인 성공 - 사원번호: {}", user.getEmployeeNo());
        authHistoryService.record(user, AuthEventType.LOGIN);
        return TokenResponse.builder()
                .accessToken(accessToken)
                .tokenType("Bearer")
                .passwordResetRequired(Boolean.TRUE.equals(user.getMustChangePassword()))
                .build();
    }

    /** deptCd → 부서명 조회 헬퍼. 없으면 null 반환. */
    private String resolveDeptName(Integer companyCd, Integer deptCd) {
        if (deptCd == null) return null;
        return departmentRepository.findById(new DepartmentId(companyCd, deptCd))
                .map(d -> d.getDeptNm())
                .orElse(null);
    }

    /** 시트 #1 — 마이페이지에서 2차인증 활성/비활성 토글. */
    @Transactional
    public UserResponse toggleMfa(String userId, Integer companyCd, boolean enabled) {
        User user = userRepository.findById(new UserId(companyCd, userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        user.setMfaEnabled(enabled);
        log.info("MFA 토글 — userId={}, enabled={}", userId, enabled);
        return UserResponse.from(user, resolveDeptName(companyCd, user.getDeptCd()));
    }

    @Transactional
    public void logout(String userId) {
        log.info("로그아웃 처리 - userId: {}", userId);
    }

    @Transactional(readOnly = true)
    public UserResponse getMe(String userId, Integer companyCd) {
        User user = userRepository.findById(new UserId(companyCd, userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        return UserResponse.from(user, resolveDeptName(companyCd, user.getDeptCd()));
    }

    @Transactional
    public UserResponse updateMyCcCd(String userId, Integer companyCd, String ccCd) {
        User user = userRepository.findById(new UserId(companyCd, userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        user.setCcCd(ccCd);
        log.info("cc_cd 변경 - userId: {}, companyCd: {}, ccCd: {}", userId, companyCd, ccCd);
        return UserResponse.from(user, resolveDeptName(companyCd, user.getDeptCd()));
    }

    /** 시트 #1 0504_1 — 마이페이지에서 본인 휴대폰/연락처/이메일 갱신. 빈 문자열은 NULL 로 저장. */
    @Transactional
    public UserResponse updateMyProfile(String userId, Integer companyCd,
                                         String phone, String contactPhone, String email) {
        User user = userRepository.findById(new UserId(companyCd, userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        user.setPhone(phone != null && !phone.isBlank() ? phone.trim() : null);
        user.setContactPhone(contactPhone != null && !contactPhone.isBlank() ? contactPhone.trim() : null);
        user.setEmail(email != null && !email.isBlank() ? email.trim() : null);
        // 직책은 본인이 바꾸지 않는다 — 관리자 > 사용자 관리에서만(2026-10-06, HRM 과 같게).
        log.info("프로필 변경 - userId: {}, phone: {}, contactPhone: {}, email: {}", userId, phone, contactPhone, email);
        return UserResponse.from(user, resolveDeptName(companyCd, user.getDeptCd()));
    }

    /** 시트 #1 0504 — 마이페이지 비밀번호 변경. 현재 비밀번호로 본인 확인. */
    @Transactional
    public TokenResponse changeMyPassword(String userId, Integer companyCd,
                                           String currentPassword, String newPassword) {
        User user = userRepository.findById(new UserId(companyCd, userId))
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (passwordEncoder.matches(newPassword, user.getPassword())) {
            // 새 비밀번호가 기존과 동일 — 안내성 차단.
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        user.changePassword(passwordEncoder.encode(newPassword));
        authHistoryService.record(user, AuthEventType.PASSWORD_CHANGED);
        log.info("비밀번호 변경 - userId: {}", userId);
        // 임시 비밀번호 토큰(pwc)은 변경 후에도 막혀 있으므로 새 토큰을 내려준다 — 프론트가 갈아끼운다.
        return issueAccessToken(user);
    }

    /** 비밀번호 분실 — ERP ID(로그인 ID)로 사용자를 찾아 임시 비밀번호를 Teams DM 으로 발송한다.
     *  ★Teams 전송이 성공한 뒤에만 비밀번호를 교체한다(전송 실패 시 계정이 잠기지 않도록). */
    @Transactional
    public void resetPassword(Integer companyCd, String loginId) {
        int coCd = companyCd != null ? companyCd : 1000;
        String id = loginId != null ? loginId.trim() : null;
        if (id == null || id.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "ERP ID를 입력해주세요.");
        }

        // 연속 발급 방지 — 남의 계정 비밀번호를 반복 초기화하는 방해행위 차단.
        Long last = lastResetAtByLoginId.get(id);
        long now = System.currentTimeMillis();
        if (last != null && now - last < RESET_COOLDOWN_MS) {
            long wait = (RESET_COOLDOWN_MS - (now - last)) / 1000;
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "방금 발급했습니다. " + wait + "초 후에 다시 시도해주세요.");
        }

        User user = userRepository.findByCompanyCdAndUserId(coCd, id).orElse(null);
        if (user == null || !user.isActive()) {
            passwordEncoder.encode("timing-flatten");   // 타이밍 평탄화
            log.info("비밀번호 재설정 거부 — loginId={}, reason={}", id,
                    user == null ? "USER_NOT_FOUND" : "INACTIVE");
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS,
                    "등록되지 않았거나 사용할 수 없는 ERP ID입니다. IT지원팀으로 문의해주세요.");
        }
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            log.warn("비밀번호 재설정 — 이메일(Teams 계정) 없음 loginId={}", id);
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "등록된 이메일(Teams 계정)이 없어 임시 비밀번호를 보낼 수 없습니다. IT지원팀으로 문의해주세요.");
        }

        String tempPassword = generateTempPassword();

        // 1) 먼저 Teams 로 보낸다. 실패하면 비밀번호를 건드리지 않고 끝낸다.
        try {
            teamsGraphClient.sendToUser(user.getEmail(),
                    "<h3>🔑 TARA TPS CRM 임시 비밀번호</h3>"
                    + "<p>" + escapeHtml(user.getName()) + "님, 요청하신 임시 비밀번호입니다.</p>"
                    + "<p style=\"font-size:18px\"><b>" + tempPassword + "</b></p>"
                    + "<p>이 비밀번호로 로그인하면 <b>새 비밀번호를 바로 설정</b>하게 됩니다.</p>"
                    + "<p>본인이 요청하지 않았다면 IT지원팀으로 알려주세요.</p>");
        } catch (Exception e) {
            log.error("임시 비밀번호 Teams 전송 실패 — loginId={}, email={}: {}", id, user.getEmail(), e.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                    "Teams 메시지를 보내지 못했습니다. IT지원팀으로 문의해주세요.");
        }

        // 2) 전송이 확인된 뒤에 저장 + 강제 변경 플래그 ON.
        user.applyTempPassword(passwordEncoder.encode(tempPassword));
        lastResetAtByLoginId.put(id, now);
        log.info("임시 비밀번호 Teams 발송 완료 — loginId={}, empNo={}", id, user.getEmployeeNo());
    }

    /** Teams HTML 본문에 이름 삽입 시 최소 이스케이프. */
    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private String generateTempPassword() {
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) {
            sb.append(TEMP_PWD_CHARS.charAt(SECURE_RANDOM.nextInt(TEMP_PWD_CHARS.length())));
        }
        return sb.toString();
    }

    private void sendTempPasswordEmail(String toEmail, String name, String tempPassword) {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            log.warn("임시 비밀번호 메일 — JavaMailSender 미설정. 이메일 미발송.");
            return;
        }
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, false, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(toEmail);
            helper.setSubject("[TARA TPS CRM] 임시 비밀번호 안내");
            helper.setText(
                    name + " 님, 안녕하세요.\n\n" +
                    "임시 비밀번호: " + tempPassword + "\n\n" +
                    "로그인 후 즉시 비밀번호를 변경해 주세요.\n" +
                    "비밀번호 변경은 우상단 아이콘 → 내 정보(마이페이지)에서 하실 수 있습니다.", false
            );
            mailSender.send(msg);
            log.info("임시 비밀번호 발송 완료 — email={}", toEmail);
        } catch (Exception e) {
            log.error("임시 비밀번호 발송 실패 — email={}: {}", toEmail, e.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR);
        }
    }
}
