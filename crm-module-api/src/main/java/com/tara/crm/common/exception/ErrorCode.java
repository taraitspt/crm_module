package com.tara.crm.common.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {

    // 공통
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON_001", "내부 서버 오류가 발생했습니다."),
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "COMMON_002", "입력값이 올바르지 않습니다."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "COMMON_003", "요청한 리소스를 찾을 수 없습니다."),
    DUPLICATE_RESOURCE(HttpStatus.CONFLICT, "COMMON_004", "이미 존재하는 리소스입니다."),

    // 인증
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "AUTH_001", "인증이 필요합니다."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "AUTH_002", "사원번호 또는 비밀번호가 올바르지 않습니다."),
    TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "AUTH_003", "토큰이 만료되었습니다."),
    TOKEN_INVALID(HttpStatus.UNAUTHORIZED, "AUTH_004", "유효하지 않은 토큰입니다."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "AUTH_007", "접근 권한이 없습니다."),
    ACCOUNT_LOCKED(HttpStatus.LOCKED, "AUTH_008", "비밀번호를 여러 번 틀려 계정이 잠겼습니다. 잠시 후 다시 시도하세요."),
    INITIAL_PASSWORD_REQUIRED(HttpStatus.UNAUTHORIZED, "AUTH_010", "처음 로그인하는 계정입니다. [비밀번호 분실]에서 Teams로 1회용 비밀번호를 받은 뒤 그 비밀번호로 로그인하세요."),
    PASSWORD_CHANGE_REQUIRED(HttpStatus.FORBIDDEN, "AUTH_011", "임시 비밀번호 상태입니다. 새 비밀번호를 먼저 설정하세요."),
    MFA_CHALLENGE_EXPIRED(HttpStatus.UNAUTHORIZED, "AUTH_012", "인증 코드 입력 횟수를 넘겼거나 만료됐습니다. 다시 로그인해 새 코드를 받으세요."),

    // 사용자
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "USER_001", "사용자를 찾을 수 없습니다."),
    USER_INACTIVE(HttpStatus.FORBIDDEN, "USER_002", "비활성화된 계정입니다."),
    EMPLOYEE_NO_DUPLICATE(HttpStatus.CONFLICT, "USER_003", "이미 사용 중인 사원번호입니다."),

    // 주문
    ORDER_NOT_FOUND(HttpStatus.NOT_FOUND, "ORDER_001", "주문을 찾을 수 없습니다."),
    ORDER_STATUS_INVALID(HttpStatus.BAD_REQUEST, "ORDER_002", "현재 주문 상태에서는 해당 작업을 수행할 수 없습니다."),
    ORDER_DELETE_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "ORDER_003", "주문접수 상태의 주문만 삭제할 수 있습니다."),

    // 매출
    SALES_NOT_FOUND(HttpStatus.NOT_FOUND, "SALES_001", "매출 정보를 찾을 수 없습니다."),
    SALES_ALREADY_CONFIRMED(HttpStatus.BAD_REQUEST, "SALES_002", "이미 확정된 매출입니다."),
    SALES_PERIOD_LOCKED(HttpStatus.BAD_REQUEST, "SALES_003", "해당 월의 매출마감이 끝났습니다."),
    TAX_PERIOD_LOCKED(HttpStatus.BAD_REQUEST, "SALES_004", "해당 월의 세금계산서 발행이 이미 마감되었습니다."),
    SALES_STATUS_INVALID(HttpStatus.BAD_REQUEST, "SALES_005", "현재 매출 상태에서는 해당 작업을 수행할 수 없습니다."),

    // 외주
    PO_NOT_FOUND(HttpStatus.NOT_FOUND, "PO_001", "외주발주를 찾을 수 없습니다."),
    INVALID_SETTLEMENT_STATUS(HttpStatus.BAD_REQUEST, "PO_002", "유효하지 않은 정산여부 값입니다."),
    PO_ALREADY_EXISTS(HttpStatus.CONFLICT, "PO_003", "이 작업에는 이미 외주발주가 등록되어 있습니다."),
    SETTLEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "SETTLE_001", "외주정산을 찾을 수 없습니다."),

    // 엑셀
    EXCEL_EXPORT_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "EXCEL_001", "엑셀 파일 생성에 실패했습니다."),
    EXCEL_IMPORT_FAILED(HttpStatus.BAD_REQUEST, "EXCEL_002", "엑셀 파일 읽기에 실패했습니다."),
    EXCEL_EMPTY(HttpStatus.BAD_REQUEST, "EXCEL_003", "파일이 비어있습니다."),
    EXCEL_INVALID_FORMAT(HttpStatus.BAD_REQUEST, "EXCEL_004", "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다."),
    EXCEL_TOO_LARGE(HttpStatus.BAD_REQUEST, "EXCEL_005", "파일 크기가 10MB를 초과합니다."),
    EXCEL_INVALID(HttpStatus.BAD_REQUEST, "EXCEL_006", "시트를 찾을 수 없습니다."),

    // 정보관리 - 사업자
    BIZ_OWNER_NOT_FOUND(HttpStatus.NOT_FOUND, "BIZ_001", "사업자를 찾을 수 없습니다."),
    BIZ_NO_DUPLICATE(HttpStatus.CONFLICT, "BIZ_002", "이미 등록된 사업자번호입니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;
}
