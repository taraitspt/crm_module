package com.tara.crm.auth.service;

import com.tara.crm.auth.entity.AuthEventType;
import com.tara.crm.auth.entity.AuthHistory;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.AuthHistoryRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuthHistoryService {

    private final AuthHistoryRepository authHistoryRepository;

    public void record(User user, AuthEventType eventType) {
        HttpServletRequest request = currentRequest();
        authHistoryRepository.save(AuthHistory.builder()
                .companyCd(user.getId().getCompanyCd())
                .userId(user.getId().getId())
                .employeeNo(user.getEmployeeNo())
                .eventType(eventType)
                .ipAddress(resolveClientIp(request))
                .userAgent(truncate(request != null ? request.getHeader("User-Agent") : null, 500))
                .occurredAt(LocalDateTime.now())
                .build());
    }

    private HttpServletRequest currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes.getRequest();
        }
        return null;
    }

    private String resolveClientIp(HttpServletRequest request) {
        if (request == null) return null;
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return truncate(forwardedFor.split(",")[0].trim(), 45);
        }
        return truncate(request.getRemoteAddr(), 45);
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
