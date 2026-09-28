package com.tara.crm.common.exception;

/**
 * 중복 리소스 생성 시 발생하는 예외.
 */
public class DuplicateResourceException extends BusinessException {

    public DuplicateResourceException(ErrorCode errorCode) {
        super(errorCode);
    }

    public DuplicateResourceException(String resourceName, String fieldName, String value) {
        super(ErrorCode.DUPLICATE_RESOURCE,
                String.format("%s의 %s '%s'이(가) 이미 존재합니다.", resourceName, fieldName, value));
    }
}
