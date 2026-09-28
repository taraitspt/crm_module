package com.tara.crm.common.exception;

/**
 * 리소스를 찾을 수 없을 때 발생하는 예외.
 */
public class ResourceNotFoundException extends BusinessException {

    public ResourceNotFoundException(ErrorCode errorCode) {
        super(errorCode);
    }

    public ResourceNotFoundException(String resourceName, Long id) {
        super(ErrorCode.RESOURCE_NOT_FOUND,
                String.format("%s(ID: %d)을(를) 찾을 수 없습니다.", resourceName, id));
    }
}
