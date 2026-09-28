package com.tara.crm.common.exception;

import com.tara.crm.common.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * 전역 예외 처리 핸들러.
 * 모든 컨트롤러에서 발생하는 예외를 일관된 형식으로 응답한다.
 *
 * basePackages 를 com.tara.crm 으로 제한 — 이게 없으면 Spring Boot actuator
 * (org.springframework.boot.actuate.*) 의 endpoint 까지 이 advice 가 가로채
 * /actuator/health 가 ApiResponse 500 으로 래핑되던 문제(QA 진단)가 발생한다.
 * 제한하면 actuator 는 자체 health 응답(200 UP / 503 DOWN)을 정상 반환.
 */
@Slf4j
@RestControllerAdvice(basePackages = "com.tara.crm")
public class GlobalExceptionHandler {

    // 비즈니스 예외 처리
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
        log.warn("비즈니스 예외 발생: {} - {}", e.getErrorCode().getCode(), e.getMessage());
        ErrorCode errorCode = e.getErrorCode();
        return ResponseEntity
                .status(errorCode.getHttpStatus())
                .body(ApiResponse.error(errorCode.getCode(), e.getMessage()));
    }

    // Validation 예외 처리 (@Valid 실패)
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> handleValidationException(
            MethodArgumentNotValidException e) {
        Map<String, String> errors = new HashMap<>();
        e.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });
        log.warn("입력값 검증 실패: {}", errors);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(ErrorCode.INVALID_INPUT.getCode(), "입력값이 올바르지 않습니다."));
    }

    // Spring Security 인증 실패
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponse<Void>> handleBadCredentials(BadCredentialsException e) {
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponse.error(ErrorCode.INVALID_CREDENTIALS.getCode(),
                        ErrorCode.INVALID_CREDENTIALS.getMessage()));
    }

    // Spring Security 접근 거부
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException e) {
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error(ErrorCode.ACCESS_DENIED.getCode(),
                        ErrorCode.ACCESS_DENIED.getMessage()));
    }

    // PR-35 — 필수 query/form param 누락은 4xx Bad Request 가 맞음.
    //   catch-all (Exception.class) 이 가로채면 500 으로 변환되어 사용자가 서버 오류로 오인.
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingParam(MissingServletRequestParameterException e) {
        log.warn("필수 요청 파라미터 누락: {} ({})", e.getParameterName(), e.getParameterType());
        String msg = "필수 요청 파라미터 누락: '" + e.getParameterName() + "'";
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(ErrorCode.INVALID_INPUT.getCode(), msg));
    }

    // PR-35 — 잘못된 타입(예: ?year=abc) 도 4xx Bad Request.
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        log.warn("요청 파라미터 타입 불일치: {} (값={})", e.getName(), e.getValue());
        String msg = "파라미터 '" + e.getName() + "' 의 값이 올바르지 않습니다.";
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(ErrorCode.INVALID_INPUT.getCode(), msg));
    }

    /**
     * ResponseStatusException — 상태코드와 사유를 직접 지정해 던진 예외(파일 PDF 변환 등).
     * 이 핸들러가 없으면 아래 Exception 핸들러가 잡아 "내부 서버 오류"로 뭉개져,
     * "LibreOffice 미설치" 같은 실제 원인이 사용자에게 전달되지 않는다.
     */
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> handleResponseStatus(
            org.springframework.web.server.ResponseStatusException e) {
        String msg = e.getReason() != null ? e.getReason() : ErrorCode.INTERNAL_SERVER_ERROR.getMessage();
        log.warn("ResponseStatusException: status={} reason={}", e.getStatusCode(), msg);
        return ResponseEntity
                .status(e.getStatusCode())
                .body(ApiResponse.error(ErrorCode.INTERNAL_SERVER_ERROR.getCode(), msg));
    }

    // 기타 모든 예외
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleException(Exception e) {
        log.error("예상하지 못한 서버 오류 발생", e);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(ErrorCode.INTERNAL_SERVER_ERROR.getCode(),
                        ErrorCode.INTERNAL_SERVER_ERROR.getMessage()));
    }
}
