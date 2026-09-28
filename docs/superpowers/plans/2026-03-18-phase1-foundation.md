# Phase 1: 프로젝트 기초 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spring Boot + React 프로젝트 스캐폴딩, MariaDB 설정, JWT 인증, 공용 컴포넌트 구축

**Architecture:** 모놀리식 아키텍처. Spring Boot 3.x 백엔드 + React 18 SPA 프론트엔드. MariaDB 10.11+, Flyway 마이그레이션.

**Tech Stack:** Java 17, Spring Boot 3.x, Spring Security, JWT, Spring Data JPA, QueryDSL, Flyway, MapStruct, Swagger | React 18, TypeScript, Vite, Ant Design, Zustand, Axios, React Query, React Router v6

**Spec:** `docs/superpowers/specs/2026-03-18-sm-module-design.md`

---

## Task 1: Backend 프로젝트 초기화

**Files:**
- `sm-module-api/build.gradle`
- `sm-module-api/settings.gradle`
- `sm-module-api/gradle/wrapper/gradle-wrapper.properties`
- `sm-module-api/src/main/java/com/tara/sm/SmModuleApplication.java`
- `sm-module-api/src/main/resources/application.yml`
- `sm-module-api/src/main/resources/application-dev.yml`
- `sm-module-api/src/main/resources/application-prod.yml`

### Steps

- [ ] 1.1 프로젝트 디렉토리 생성

```bash
mkdir -p sm-module-api/src/main/java/com/tara/sm
mkdir -p sm-module-api/src/main/resources/db/migration
mkdir -p sm-module-api/src/test/java/com/tara/sm
mkdir -p sm-module-api/gradle/wrapper
```

- [ ] 1.2 `sm-module-api/settings.gradle` 작성

```groovy
rootProject.name = 'sm-module-api'
```

- [ ] 1.3 `sm-module-api/build.gradle` 작성

```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.5'
    id 'io.spring.dependency-management' version '1.1.5'
}

group = 'com.tara'
version = '0.0.1-SNAPSHOT'

java {
    sourceCompatibility = '17'
    targetCompatibility = '17'
}

configurations {
    compileOnly {
        extendsFrom annotationProcessor
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Spring Boot Starters
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-validation'

    // Database
    runtimeOnly 'org.mariadb.jdbc:mariadb-java-client'
    implementation 'org.flywaydb:flyway-core'
    implementation 'org.flywaydb:flyway-mysql'

    // JWT
    implementation 'io.jsonwebtoken:jjwt-api:0.12.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.12.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.12.5'

    // QueryDSL
    implementation 'com.querydsl:querydsl-jpa:5.1.0:jakarta'
    annotationProcessor 'com.querydsl:querydsl-apt:5.1.0:jakarta'
    annotationProcessor 'jakarta.annotation:jakarta.annotation-api'
    annotationProcessor 'jakarta.persistence:jakarta.persistence-api'

    // MapStruct
    implementation 'org.mapstruct:mapstruct:1.5.5.Final'
    annotationProcessor 'org.mapstruct:mapstruct-processor:1.5.5.Final'

    // Swagger / OpenAPI
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.5.0'

    // Lombok
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
    // Lombok + MapStruct 연동을 위해 lombok-mapstruct-binding 추가
    annotationProcessor 'org.projectlombok:lombok-mapstruct-binding:0.2.0'

    // Test
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.security:spring-security-test'
}

tasks.named('test') {
    useJUnitPlatform()
}

// QueryDSL Q클래스 생성 경로 설정
def querydslDir = "$buildDir/generated/querydsl"

sourceSets {
    main.java.srcDirs += [ querydslDir ]
}

tasks.withType(JavaCompile).configureEach {
    options.generatedSourceOutputDirectory = file(querydslDir)
}

clean.doLast {
    file(querydslDir).deleteDir()
}
```

- [ ] 1.4 Gradle Wrapper 설정

```bash
cd sm-module-api
# Gradle 8.7 wrapper 생성 (gradle이 설치되어 있다면)
gradle wrapper --gradle-version 8.7
# 또는 수동으로 gradle-wrapper.properties 파일 생성
```

`sm-module-api/gradle/wrapper/gradle-wrapper.properties`:
```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

- [ ] 1.5 `sm-module-api/src/main/java/com/tara/sm/SmModuleApplication.java` 작성

```java
package com.tara.sm;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class SmModuleApplication {

    public static void main(String[] args) {
        SpringApplication.run(SmModuleApplication.class, args);
    }
}
```

- [ ] 1.6 `sm-module-api/src/main/resources/application.yml` 작성

```yaml
spring:
  profiles:
    active: dev

  application:
    name: sm-module-api

  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        format_sql: true
        default_batch_fetch_size: 100
    open-in-view: false

  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true

  servlet:
    multipart:
      max-file-size: 50MB
      max-request-size: 50MB

server:
  port: 8080

# JWT 설정
jwt:
  secret: CHANGE_THIS_TO_A_SECURE_RANDOM_SECRET_KEY_AT_LEAST_256_BITS_LONG_FOR_PRODUCTION
  access-token-expiration: 1800000   # 30분 (ms)
  refresh-token-expiration: 604800000 # 7일 (ms)

# 로깅
logging:
  level:
    com.tara.sm: INFO
    org.hibernate.SQL: DEBUG
    org.hibernate.type.descriptor.sql.BasicBinder: TRACE
```

- [ ] 1.7 `sm-module-api/src/main/resources/application-dev.yml` 작성

```yaml
spring:
  datasource:
    url: jdbc:mariadb://localhost:3306/sm_module?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Seoul
    username: root
    password: tara1080!!
    driver-class-name: org.mariadb.jdbc.Driver
    hikari:
      maximum-pool-size: 10
      minimum-idle: 5
      connection-timeout: 30000

  jpa:
    show-sql: true

logging:
  level:
    com.tara.sm: DEBUG
```

- [ ] 1.8 `sm-module-api/src/main/resources/application-prod.yml` 작성

```yaml
spring:
  datasource:
    url: jdbc:mariadb://${DB_HOST:localhost}:${DB_PORT:3306}/${DB_NAME:sm_module}?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Seoul
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}
    driver-class-name: org.mariadb.jdbc.Driver
    hikari:
      maximum-pool-size: 20
      minimum-idle: 10
      connection-timeout: 30000

  jpa:
    show-sql: false

jwt:
  secret: ${JWT_SECRET}

logging:
  level:
    com.tara.sm: INFO
    org.hibernate.SQL: WARN
```

- [ ] 1.9 빌드 확인

```bash
cd sm-module-api
./gradlew build -x test
# 기대 출력: BUILD SUCCESSFUL
```

- [ ] 1.10 Git 커밋

```bash
git add sm-module-api/
git commit -m "feat: Spring Boot 백엔드 프로젝트 초기화 (Gradle, MariaDB, JWT, QueryDSL)"
```

---

## Task 2: 공통 모듈 - BaseEntity, ApiResponse, GlobalExceptionHandler

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/common/audit/BaseEntity.java`
- `sm-module-api/src/main/java/com/tara/sm/common/audit/AuditorAwareImpl.java`
- `sm-module-api/src/main/java/com/tara/sm/common/dto/ApiResponse.java`
- `sm-module-api/src/main/java/com/tara/sm/common/dto/PageResponse.java`
- `sm-module-api/src/main/java/com/tara/sm/common/exception/ErrorCode.java`
- `sm-module-api/src/main/java/com/tara/sm/common/exception/BusinessException.java`
- `sm-module-api/src/main/java/com/tara/sm/common/exception/ResourceNotFoundException.java`
- `sm-module-api/src/main/java/com/tara/sm/common/exception/DuplicateResourceException.java`
- `sm-module-api/src/main/java/com/tara/sm/common/exception/GlobalExceptionHandler.java`

### Steps

- [ ] 2.1 패키지 디렉토리 생성

```bash
mkdir -p sm-module-api/src/main/java/com/tara/sm/common/audit
mkdir -p sm-module-api/src/main/java/com/tara/sm/common/dto
mkdir -p sm-module-api/src/main/java/com/tara/sm/common/exception
mkdir -p sm-module-api/src/main/java/com/tara/sm/common/config
mkdir -p sm-module-api/src/main/java/com/tara/sm/common/util
```

- [ ] 2.2 `BaseEntity.java` 작성 - JPA Auditing 기반 엔티티

```java
package com.tara.sm.common.audit;

import jakarta.persistence.*;
import lombok.Getter;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 모든 엔티티의 공통 감사(Audit) 필드를 제공하는 기본 엔티티.
 * created_at, updated_at, created_by, updated_by + Soft Delete 컬럼 포함.
 */
@Getter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false)
    private Long createdBy;

    @LastModifiedBy
    @Column(name = "updated_by")
    private Long updatedBy;

    // --- Soft Delete ---
    @Column(name = "deleted", nullable = false)
    private Boolean deleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "deleted_by")
    private Long deletedBy;

    /**
     * 소프트 삭제 처리
     */
    public void softDelete(Long deletedByUserId) {
        this.deleted = true;
        this.deletedAt = LocalDateTime.now();
        this.deletedBy = deletedByUserId;
    }

    /**
     * 소프트 삭제 복원
     */
    public void restore() {
        this.deleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
    }
}
```

- [ ] 2.3 `AuditorAwareImpl.java` 작성

```java
package com.tara.sm.common.audit;

import org.springframework.data.domain.AuditorAware;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Spring Data JPA Auditing에서 현재 사용자 ID를 제공.
 * SecurityContext에서 인증된 사용자 ID를 추출한다.
 */
@Component
public class AuditorAwareImpl implements AuditorAware<Long> {

    @Override
    public Optional<Long> getCurrentAuditor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return Optional.empty();
        }

        try {
            // Principal에서 사용자 ID 추출 (UserPrincipal 구현 후 연동)
            Long userId = Long.valueOf(authentication.getName());
            return Optional.of(userId);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }
}
```

- [ ] 2.4 `ApiResponse.java` 작성

```java
package com.tara.sm.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 공통 API 응답 래퍼.
 * 모든 REST API는 이 형식으로 응답한다.
 */
@Getter
@Builder
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private final boolean success;
    private final T data;
    private final String message;
    private final String errorCode;

    @Builder.Default
    private final LocalDateTime timestamp = LocalDateTime.now();

    // 성공 응답 (데이터 포함)
    public static <T> ApiResponse<T> ok(T data) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .build();
    }

    // 성공 응답 (메시지 포함)
    public static <T> ApiResponse<T> ok(T data, String message) {
        return ApiResponse.<T>builder()
                .success(true)
                .data(data)
                .message(message)
                .build();
    }

    // 성공 응답 (데이터 없음)
    public static ApiResponse<Void> ok() {
        return ApiResponse.<Void>builder()
                .success(true)
                .build();
    }

    // 실패 응답
    public static <T> ApiResponse<T> error(String errorCode, String message) {
        return ApiResponse.<T>builder()
                .success(false)
                .errorCode(errorCode)
                .message(message)
                .build();
    }
}
```

- [ ] 2.5 `PageResponse.java` 작성

```java
package com.tara.sm.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 페이징 응답 DTO.
 * Spring Data Page를 프론트엔드 친화적인 형태로 변환한다.
 */
@Getter
@Builder
@AllArgsConstructor
public class PageResponse<T> {

    private final List<T> content;
    private final long totalElements;
    private final int totalPages;
    private final int page;
    private final int size;

    public static <T> PageResponse<T> from(Page<T> page) {
        return PageResponse.<T>builder()
                .content(page.getContent())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .page(page.getNumber())
                .size(page.getSize())
                .build();
    }
}
```

- [ ] 2.6 `ErrorCode.java` 작성

```java
package com.tara.sm.common.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

/**
 * 시스템 전체 에러 코드 정의.
 */
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
    REFRESH_TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "AUTH_005", "리프레시 토큰이 만료되었습니다."),
    REFRESH_TOKEN_REVOKED(HttpStatus.UNAUTHORIZED, "AUTH_006", "무효화된 리프레시 토큰입니다."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "AUTH_007", "접근 권한이 없습니다."),

    // 사용자
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "USER_001", "사용자를 찾을 수 없습니다."),
    USER_INACTIVE(HttpStatus.FORBIDDEN, "USER_002", "비활성화된 계정입니다."),
    EMPLOYEE_NO_DUPLICATE(HttpStatus.CONFLICT, "USER_003", "이미 사용 중인 사원번호입니다."),

    // 주문
    ORDER_NOT_FOUND(HttpStatus.NOT_FOUND, "ORDER_001", "주문을 찾을 수 없습니다."),
    ORDER_STATUS_INVALID(HttpStatus.BAD_REQUEST, "ORDER_002", "현재 주문 상태에서는 해당 작업을 수행할 수 없습니다."),
    ORDER_DELETE_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "ORDER_003", "접수대기 상태의 주문만 삭제할 수 있습니다."),

    // 매출
    SALES_NOT_FOUND(HttpStatus.NOT_FOUND, "SALES_001", "매출 정보를 찾을 수 없습니다."),
    SALES_ALREADY_CONFIRMED(HttpStatus.BAD_REQUEST, "SALES_002", "이미 확정된 매출입니다."),

    // 외주
    PO_NOT_FOUND(HttpStatus.NOT_FOUND, "PO_001", "외주발주를 찾을 수 없습니다."),
    SETTLEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "SETTLE_001", "외주정산을 찾을 수 없습니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;
}
```

- [ ] 2.7 `BusinessException.java` 작성

```java
package com.tara.sm.common.exception;

import lombok.Getter;

/**
 * 비즈니스 로직 예외의 기본 클래스.
 */
@Getter
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }
}
```

- [ ] 2.8 `ResourceNotFoundException.java` 작성

```java
package com.tara.sm.common.exception;

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
```

- [ ] 2.9 `DuplicateResourceException.java` 작성

```java
package com.tara.sm.common.exception;

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
```

- [ ] 2.10 `GlobalExceptionHandler.java` 작성

```java
package com.tara.sm.common.exception;

import com.tara.sm.common.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/**
 * 전역 예외 처리 핸들러.
 * 모든 컨트롤러에서 발생하는 예외를 일관된 형식으로 응답한다.
 */
@Slf4j
@RestControllerAdvice
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
```

- [ ] 2.11 빌드 확인

```bash
cd sm-module-api
./gradlew compileJava
# 기대 출력: BUILD SUCCESSFUL
```

- [ ] 2.12 Git 커밋

```bash
git add sm-module-api/src/main/java/com/tara/sm/common/
git commit -m "feat: 공통 모듈 추가 (BaseEntity, ApiResponse, GlobalExceptionHandler, ErrorCode)"
```

---

## Task 3: MariaDB + Flyway 마이그레이션 (인증/권한 테이블)

**Files:**
- `sm-module-api/src/main/resources/db/migration/V1__create_auth_tables.sql`

### Steps

- [ ] 3.1 MariaDB 데이터베이스 및 사용자 생성 (수동, 사전 준비)

```sql
-- MariaDB에 접속하여 실행
CREATE DATABASE IF NOT EXISTS sm_module
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'sm_user'@'%' IDENTIFIED BY 'sm_password';
GRANT ALL PRIVILEGES ON sm_module.* TO 'sm_user'@'%';
FLUSH PRIVILEGES;
```

- [ ] 3.2 `V1__create_auth_tables.sql` 작성

```sql
-- ============================================================
-- V1: 인증/권한 기초 테이블 + 시퀀스 번호 테이블
-- SM Module - Phase 1 Foundation
-- ============================================================

-- 부서/파트 테이블
CREATE TABLE departments (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    name           VARCHAR(50)  NOT NULL COMMENT '부서명 (시청파트, 역삼1파트 등)',
    division       VARCHAR(50)  NOT NULL COMMENT '사업본부 (그래픽스/PM/국내/해외)',
    parent_id      BIGINT       NULL COMMENT '상위 부서 ID',
    sort_order     INT          NOT NULL DEFAULT 0 COMMENT '정렬 순서',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by     BIGINT       NULL,
    updated_by     BIGINT       NULL,
    deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at     DATETIME     NULL,
    deleted_by     BIGINT       NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_dept_parent FOREIGN KEY (parent_id) REFERENCES departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='부서/파트';

-- 사용자 테이블
CREATE TABLE users (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    employee_no    VARCHAR(20)  NOT NULL COMMENT '사원번호',
    password       VARCHAR(255) NOT NULL COMMENT 'BCrypt 암호화 비밀번호',
    name           VARCHAR(50)  NOT NULL COMMENT '이름',
    phone          VARCHAR(20)  NULL COMMENT '휴대폰번호',
    email          VARCHAR(100) NULL COMMENT '이메일',
    department_id  BIGINT       NULL COMMENT '소속 부서',
    role           ENUM('ADMIN','MANAGER','STAFF') NOT NULL DEFAULT 'STAFF' COMMENT '역할',
    status         ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE' COMMENT '계정 상태',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by     BIGINT       NULL,
    updated_by     BIGINT       NULL,
    deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at     DATETIME     NULL,
    deleted_by     BIGINT       NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_employee_no (employee_no),
    CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='사용자';

-- 리프레시 토큰 테이블
CREATE TABLE refresh_tokens (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    user_id        BIGINT       NOT NULL COMMENT '사용자 ID',
    token_hash     VARCHAR(255) NOT NULL COMMENT '토큰 SHA-256 해시',
    expires_at     DATETIME     NOT NULL COMMENT '만료일시',
    revoked        BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '무효화 여부',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_refresh_tokens_user (user_id),
    INDEX idx_refresh_tokens_hash (token_hash),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='리프레시 토큰';

-- 번호 시퀀스 테이블 (주문번호, 발주번호 등 동시성 제어)
CREATE TABLE sequence_numbers (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    seq_type       VARCHAR(20)  NOT NULL COMMENT '번호 유형 (ORDER, UNTACT, PO, PRE_SALES)',
    seq_date       DATE         NOT NULL COMMENT '날짜',
    dept_code      VARCHAR(4)   NULL COMMENT '부서코드 (ORDER, UNTACT용)',
    last_seq       INT          NOT NULL DEFAULT 0 COMMENT '마지막 일련번호',
    PRIMARY KEY (id),
    UNIQUE KEY uk_seq (seq_type, seq_date, dept_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='번호 시퀀스';

-- 인덱스: 사용자 테이블
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- 인덱스: 부서 테이블
CREATE INDEX idx_departments_division ON departments(division);
CREATE INDEX idx_departments_parent ON departments(parent_id);

-- ============================================================
-- 초기 데이터: 부서 구조
-- ============================================================
INSERT INTO departments (name, division, parent_id, sort_order) VALUES
    ('그래픽스사업본부', '그래픽스', NULL, 1),
    ('PM사업본부', 'PM', NULL, 2),
    ('국내사업본부', '국내', NULL, 3),
    ('해외사업본부', '해외', NULL, 4);

-- 하위 파트 (그래픽스사업본부 산하)
INSERT INTO departments (name, division, parent_id, sort_order) VALUES
    ('시청파트', '그래픽스', 1, 1),
    ('역삼1파트', '그래픽스', 1, 2),
    ('대치파트', '그래픽스', 1, 3),
    ('을지로파트', '그래픽스', 1, 4);

-- 초기 관리자 계정 (비밀번호: admin1234! → BCrypt)
-- BCrypt hash for 'admin1234!': $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
INSERT INTO users (employee_no, password, name, role, status, department_id) VALUES
    ('ADMIN001', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '시스템관리자', 'ADMIN', 'ACTIVE', 1);
```

- [ ] 3.3 애플리케이션 기동 후 Flyway 마이그레이션 확인

```bash
cd sm-module-api
./gradlew bootRun
# 로그에서 확인: Successfully applied 1 migration to schema `sm_module`
# Ctrl+C로 종료
```

- [ ] 3.4 Git 커밋

```bash
git add sm-module-api/src/main/resources/db/migration/
git commit -m "feat: Flyway V1 마이그레이션 - 인증/권한 기초 테이블 (users, departments, refresh_tokens, sequence_numbers)"
```

---

## Task 4: JWT 인증 시스템

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/auth/entity/Role.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/entity/UserStatus.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/entity/Department.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/entity/User.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/entity/RefreshToken.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/repository/UserRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/repository/DepartmentRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/repository/RefreshTokenRepository.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/jwt/JwtTokenProvider.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/jwt/JwtAuthenticationFilter.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/dto/LoginRequest.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/dto/TokenResponse.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/dto/TokenRefreshRequest.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/dto/UserResponse.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/service/AuthService.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/service/CustomUserDetailsService.java`
- `sm-module-api/src/main/java/com/tara/sm/auth/controller/AuthController.java`
- `sm-module-api/src/main/java/com/tara/sm/common/config/SecurityConfig.java`
- `sm-module-api/src/main/java/com/tara/sm/common/config/CorsConfig.java`

### Steps

- [ ] 4.1 패키지 디렉토리 생성

```bash
mkdir -p sm-module-api/src/main/java/com/tara/sm/auth/entity
mkdir -p sm-module-api/src/main/java/com/tara/sm/auth/repository
mkdir -p sm-module-api/src/main/java/com/tara/sm/auth/jwt
mkdir -p sm-module-api/src/main/java/com/tara/sm/auth/dto
mkdir -p sm-module-api/src/main/java/com/tara/sm/auth/service
mkdir -p sm-module-api/src/main/java/com/tara/sm/auth/controller
```

- [ ] 4.2 `Role.java` 열거형

```java
package com.tara.sm.auth.entity;

/**
 * 사용자 역할.
 * ADMIN: 시스템 관리자 (전체 데이터 접근)
 * MANAGER: 파트 관리자 (본인 파트 + 하위 파트)
 * STAFF: 일반 영업직원 (본인 파트 데이터)
 */
public enum Role {
    ADMIN,
    MANAGER,
    STAFF
}
```

- [ ] 4.3 `UserStatus.java` 열거형

```java
package com.tara.sm.auth.entity;

/**
 * 사용자 계정 상태.
 */
public enum UserStatus {
    ACTIVE,
    INACTIVE
}
```

- [ ] 4.4 `Department.java` 엔티티

```java
package com.tara.sm.auth.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "departments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Department extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "division", nullable = false, length = 50)
    private String division;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Department parent;

    @OneToMany(mappedBy = "parent", fetch = FetchType.LAZY)
    @Builder.Default
    private List<Department> children = new ArrayList<>();

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;
}
```

- [ ] 4.5 `User.java` 엔티티

```java
package com.tara.sm.auth.entity;

import com.tara.sm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class User extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_no", nullable = false, unique = true, length = 20)
    private String employeeNo;

    @Column(name = "password", nullable = false)
    private String password;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "email", length = 100)
    private String email;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private UserStatus status = UserStatus.ACTIVE;

    public boolean isActive() {
        return this.status == UserStatus.ACTIVE;
    }

    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
    }

    public void updateStatus(UserStatus status) {
        this.status = status;
    }
}
```

- [ ] 4.6 `RefreshToken.java` 엔티티

```java
package com.tara.sm.auth.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "refresh_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked", nullable = false)
    @Builder.Default
    private Boolean revoked = false;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    public void revoke() {
        this.revoked = true;
    }

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(this.expiresAt);
    }

    public boolean isValid() {
        return !this.revoked && !isExpired();
    }
}
```

- [ ] 4.7 `UserRepository.java`

```java
package com.tara.sm.auth.repository;

import com.tara.sm.auth.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.department WHERE u.employeeNo = :employeeNo AND u.deleted = false")
    Optional<User> findByEmployeeNo(@Param("employeeNo") String employeeNo);

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.department WHERE u.id = :id AND u.deleted = false")
    Optional<User> findByIdWithDepartment(@Param("id") Long id);

    boolean existsByEmployeeNo(String employeeNo);
}
```

- [ ] 4.8 `DepartmentRepository.java`

```java
package com.tara.sm.auth.repository;

import com.tara.sm.auth.entity.Department;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DepartmentRepository extends JpaRepository<Department, Long> {

    @Query("SELECT d FROM Department d WHERE d.deleted = false ORDER BY d.sortOrder")
    List<Department> findAllActive();

    @Query("SELECT d FROM Department d WHERE d.parent.id = :parentId AND d.deleted = false ORDER BY d.sortOrder")
    List<Department> findByParentId(Long parentId);

    @Query("SELECT d FROM Department d WHERE d.division = :division AND d.deleted = false ORDER BY d.sortOrder")
    List<Department> findByDivision(String division);
}
```

- [ ] 4.9 `RefreshTokenRepository.java`

```java
package com.tara.sm.auth.repository;

import com.tara.sm.auth.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHashAndRevokedFalse(String tokenHash);

    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revoked = true WHERE rt.userId = :userId AND rt.revoked = false")
    void revokeAllByUserId(@Param("userId") Long userId);
}
```

- [ ] 4.10 `JwtTokenProvider.java`

```java
package com.tara.sm.auth.jwt;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * JWT 토큰 생성, 검증, 파싱을 담당하는 컴포넌트.
 */
@Slf4j
@Component
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.access-token-expiration}")
    private long accessTokenExpiration;

    @Value("${jwt.refresh-token-expiration}")
    private long refreshTokenExpiration;

    private SecretKey key;

    @PostConstruct
    public void init() {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Access Token 생성.
     * Subject = 사용자 ID, Claims에 사원번호/이름/역할/부서ID 포함.
     */
    public String generateAccessToken(Long userId, String employeeNo, String name, String role, Long departmentId) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenExpiration);

        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("employeeNo", employeeNo)
                .claim("name", name)
                .claim("role", role)
                .claim("departmentId", departmentId)
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /**
     * Refresh Token 생성 (UUID 기반).
     */
    public String generateRefreshToken() {
        return UUID.randomUUID().toString();
    }

    /**
     * Refresh Token 만료 시간(ms) 반환.
     */
    public long getRefreshTokenExpiration() {
        return refreshTokenExpiration;
    }

    /**
     * 토큰 유효성 검증.
     */
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

    /**
     * 토큰에서 Claims 추출.
     */
    public Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * 토큰에서 사용자 ID 추출.
     */
    public Long getUserId(String token) {
        return Long.valueOf(getClaims(token).getSubject());
    }

    /**
     * 토큰에서 역할 추출.
     */
    public String getRole(String token) {
        return getClaims(token).get("role", String.class);
    }
}
```

- [ ] 4.11 `JwtAuthenticationFilter.java`

```java
package com.tara.sm.auth.jwt;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * JWT 인증 필터.
 * 요청 헤더의 Bearer 토큰을 검증하고 SecurityContext에 인증 정보를 설정한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = resolveToken(request);

        if (StringUtils.hasText(token) && jwtTokenProvider.validateToken(token)) {
            Long userId = jwtTokenProvider.getUserId(token);
            String role = jwtTokenProvider.getRole(token);

            // Spring Security 인증 객체 생성
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            String.valueOf(userId), // principal = userId
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                    );

            SecurityContextHolder.getContext().setAuthentication(authentication);
            log.debug("JWT 인증 성공 - userId: {}, role: {}", userId, role);
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Authorization 헤더에서 Bearer 토큰 추출.
     */
    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader(AUTHORIZATION_HEADER);
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith(BEARER_PREFIX)) {
            return bearerToken.substring(BEARER_PREFIX.length());
        }
        return null;
    }
}
```

- [ ] 4.12 `LoginRequest.java` DTO

```java
package com.tara.sm.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class LoginRequest {

    @NotBlank(message = "사원번호는 필수입니다.")
    private String employeeNo;

    @NotBlank(message = "비밀번호는 필수입니다.")
    private String password;
}
```

- [ ] 4.13 `TokenResponse.java` DTO

```java
package com.tara.sm.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class TokenResponse {

    private String accessToken;
    private String refreshToken;
    private String tokenType;
    private Long expiresIn;
}
```

- [ ] 4.14 `TokenRefreshRequest.java` DTO

```java
package com.tara.sm.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class TokenRefreshRequest {

    @NotBlank(message = "리프레시 토큰은 필수입니다.")
    private String refreshToken;
}
```

- [ ] 4.15 `UserResponse.java` DTO

```java
package com.tara.sm.auth.dto;

import com.tara.sm.auth.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class UserResponse {

    private Long id;
    private String employeeNo;
    private String name;
    private String phone;
    private String email;
    private String role;
    private String status;
    private Long departmentId;
    private String departmentName;
    private String division;

    public static UserResponse from(User user) {
        UserResponseBuilder builder = UserResponse.builder()
                .id(user.getId())
                .employeeNo(user.getEmployeeNo())
                .name(user.getName())
                .phone(user.getPhone())
                .email(user.getEmail())
                .role(user.getRole().name())
                .status(user.getStatus().name());

        if (user.getDepartment() != null) {
            builder.departmentId(user.getDepartment().getId())
                    .departmentName(user.getDepartment().getName())
                    .division(user.getDepartment().getDivision());
        }

        return builder.build();
    }
}
```

- [ ] 4.16 `CustomUserDetailsService.java`

```java
package com.tara.sm.auth.service;

import com.tara.sm.auth.entity.User;
import com.tara.sm.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Spring Security UserDetailsService 구현.
 * 사원번호로 사용자를 조회한다.
 */
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String employeeNo) throws UsernameNotFoundException {
        User user = userRepository.findByEmployeeNo(employeeNo)
                .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다: " + employeeNo));

        return new org.springframework.security.core.userdetails.User(
                String.valueOf(user.getId()),
                user.getPassword(),
                user.isActive(),  // enabled
                true,             // accountNonExpired
                true,             // credentialsNonExpired
                true,             // accountNonLocked
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        );
    }
}
```

- [ ] 4.17 `AuthService.java`

```java
package com.tara.sm.auth.service;

import com.tara.sm.auth.dto.*;
import com.tara.sm.auth.entity.RefreshToken;
import com.tara.sm.auth.entity.User;
import com.tara.sm.auth.jwt.JwtTokenProvider;
import com.tara.sm.auth.repository.RefreshTokenRepository;
import com.tara.sm.auth.repository.UserRepository;
import com.tara.sm.common.exception.BusinessException;
import com.tara.sm.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Base64;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;

    /**
     * 로그인 처리.
     * 사원번호 + 비밀번호 검증 후 JWT Access/Refresh Token 발급.
     */
    @Transactional
    public TokenResponse login(LoginRequest request) {
        // 사용자 조회
        User user = userRepository.findByEmployeeNo(request.getEmployeeNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS));

        // 계정 활성 상태 확인
        if (!user.isActive()) {
            throw new BusinessException(ErrorCode.USER_INACTIVE);
        }

        // 비밀번호 검증
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        // 기존 리프레시 토큰 무효화
        refreshTokenRepository.revokeAllByUserId(user.getId());

        // 토큰 생성
        Long departmentId = user.getDepartment() != null ? user.getDepartment().getId() : null;
        String accessToken = jwtTokenProvider.generateAccessToken(
                user.getId(), user.getEmployeeNo(), user.getName(),
                user.getRole().name(), departmentId);
        String refreshToken = jwtTokenProvider.generateRefreshToken();

        // 리프레시 토큰 저장
        saveRefreshToken(user.getId(), refreshToken);

        log.info("로그인 성공 - 사원번호: {}, 사용자: {}", user.getEmployeeNo(), user.getName());

        return TokenResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtTokenProvider.getRefreshTokenExpiration() / 1000)
                .build();
    }

    /**
     * Access Token 갱신.
     * Refresh Token 검증 후 새 Access Token 발급.
     */
    @Transactional
    public TokenResponse refresh(TokenRefreshRequest request) {
        String tokenHash = hashToken(request.getRefreshToken());

        // 리프레시 토큰 조회 및 검증
        RefreshToken refreshToken = refreshTokenRepository.findByTokenHashAndRevokedFalse(tokenHash)
                .orElseThrow(() -> new BusinessException(ErrorCode.REFRESH_TOKEN_REVOKED));

        if (refreshToken.isExpired()) {
            refreshToken.revoke();
            throw new BusinessException(ErrorCode.REFRESH_TOKEN_EXPIRED);
        }

        // 사용자 조회
        User user = userRepository.findByIdWithDepartment(refreshToken.getUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        if (!user.isActive()) {
            throw new BusinessException(ErrorCode.USER_INACTIVE);
        }

        // 기존 토큰 무효화 & 새 토큰 발급 (Rotation)
        refreshToken.revoke();

        Long departmentId = user.getDepartment() != null ? user.getDepartment().getId() : null;
        String newAccessToken = jwtTokenProvider.generateAccessToken(
                user.getId(), user.getEmployeeNo(), user.getName(),
                user.getRole().name(), departmentId);
        String newRefreshToken = jwtTokenProvider.generateRefreshToken();

        saveRefreshToken(user.getId(), newRefreshToken);

        return TokenResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtTokenProvider.getRefreshTokenExpiration() / 1000)
                .build();
    }

    /**
     * 로그아웃 처리.
     * 해당 사용자의 모든 리프레시 토큰을 무효화한다.
     */
    @Transactional
    public void logout(Long userId) {
        refreshTokenRepository.revokeAllByUserId(userId);
        log.info("로그아웃 처리 - userId: {}", userId);
    }

    /**
     * 현재 사용자 정보 조회.
     */
    @Transactional(readOnly = true)
    public UserResponse getMe(Long userId) {
        User user = userRepository.findByIdWithDepartment(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        return UserResponse.from(user);
    }

    // --- Private helpers ---

    private void saveRefreshToken(Long userId, String rawToken) {
        RefreshToken entity = RefreshToken.builder()
                .userId(userId)
                .tokenHash(hashToken(rawToken))
                .expiresAt(LocalDateTime.now().plusSeconds(
                        jwtTokenProvider.getRefreshTokenExpiration() / 1000))
                .build();
        refreshTokenRepository.save(entity);
    }

    /**
     * 토큰을 SHA-256으로 해시하여 DB에 저장 (원본 토큰 저장 방지).
     */
    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 알고리즘을 사용할 수 없습니다.", e);
        }
    }
}
```

- [ ] 4.18 `AuthController.java`

```java
package com.tara.sm.auth.controller;

import com.tara.sm.auth.dto.*;
import com.tara.sm.auth.service.AuthService;
import com.tara.sm.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@Tag(name = "인증", description = "로그인, 토큰 갱신, 로그아웃 API")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Operation(summary = "로그인", description = "사원번호 + 비밀번호로 JWT 토큰 발급")
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<TokenResponse>> login(@Valid @RequestBody LoginRequest request) {
        TokenResponse tokenResponse = authService.login(request);
        return ResponseEntity.ok(ApiResponse.ok(tokenResponse));
    }

    @Operation(summary = "토큰 갱신", description = "Refresh Token으로 새 Access Token 발급")
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<TokenResponse>> refresh(@Valid @RequestBody TokenRefreshRequest request) {
        TokenResponse tokenResponse = authService.refresh(request);
        return ResponseEntity.ok(ApiResponse.ok(tokenResponse));
    }

    @Operation(summary = "로그아웃", description = "Refresh Token 무효화")
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(Authentication authentication) {
        Long userId = Long.valueOf(authentication.getName());
        authService.logout(userId);
        return ResponseEntity.ok(ApiResponse.ok());
    }

    @Operation(summary = "내 정보 조회", description = "현재 로그인한 사용자 정보 반환")
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getMe(Authentication authentication) {
        Long userId = Long.valueOf(authentication.getName());
        UserResponse userResponse = authService.getMe(userId);
        return ResponseEntity.ok(ApiResponse.ok(userResponse));
    }
}
```

- [ ] 4.19 `SecurityConfig.java`

```java
package com.tara.sm.common.config;

import com.tara.sm.auth.jwt.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // CSRF 비활성화 (JWT 사용)
            .csrf(AbstractHttpConfigurer::disable)
            // 세션 미사용 (Stateless)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // URL별 인가 설정
            .authorizeHttpRequests(auth -> auth
                // 인증 불필요 경로
                .requestMatchers("/api/auth/login", "/api/auth/refresh").permitAll()
                // Swagger UI
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**", "/swagger-ui.html").permitAll()
                // Actuator (선택)
                .requestMatchers("/actuator/**").permitAll()
                // 그 외 모든 요청은 인증 필요
                .anyRequest().authenticated()
            )
            // JWT 필터 등록
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
```

- [ ] 4.20 `CorsConfig.java`

```java
package com.tara.sm.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // 개발 환경 허용 오리진
        configuration.setAllowedOrigins(List.of(
                "http://localhost:5173",   // Vite dev server
                "http://localhost:3000"    // 대체 포트
        ));

        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
```

- [ ] 4.21 SecurityConfig에 CORS 연동 추가

`SecurityConfig.java`의 `filterChain` 메서드에 `.cors(cors -> cors.configurationSource(corsConfigurationSource))` 추가가 필요하다. 위 코드에서는 별도 Bean으로 등록되어 자동 적용된다. 만약 자동 적용이 안 되면 SecurityConfig에 CorsConfigurationSource를 주입하여 명시적으로 설정한다.

- [ ] 4.22 빌드 및 테스트

```bash
cd sm-module-api
./gradlew compileJava
# 기대 출력: BUILD SUCCESSFUL
```

- [ ] 4.23 Git 커밋

```bash
git add sm-module-api/src/main/java/com/tara/sm/auth/
git add sm-module-api/src/main/java/com/tara/sm/common/config/
git commit -m "feat: JWT 인증 시스템 구현 (JwtTokenProvider, SecurityConfig, AuthController, AuthService)"
```

---

## Task 5: Swagger/OpenAPI 설정

**Files:**
- `sm-module-api/src/main/java/com/tara/sm/common/config/SwaggerConfig.java`

### Steps

- [ ] 5.1 `SwaggerConfig.java` 작성

```java
package com.tara.sm.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {

    private static final String SECURITY_SCHEME_NAME = "BearerAuth";

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("SM Module API")
                        .description("인쇄/출판 영업관리 ERP 시스템 API 문서")
                        .version("v1.0.0")
                        .contact(new Contact()
                                .name("TARA SM Team")
                                .email("sm@tara.co.kr")))
                .addSecurityItem(new SecurityRequirement().addList(SECURITY_SCHEME_NAME))
                .components(new Components()
                        .addSecuritySchemes(SECURITY_SCHEME_NAME,
                                new SecurityScheme()
                                        .name(SECURITY_SCHEME_NAME)
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("JWT Access Token을 입력하세요. (Bearer 접두사 불필요)")));
    }
}
```

- [ ] 5.2 Swagger UI 접근 확인

```bash
cd sm-module-api
./gradlew bootRun
# 브라우저에서 http://localhost:8080/swagger-ui.html 접근
# API 문서가 표시되면 성공
# Ctrl+C로 종료
```

- [ ] 5.3 Git 커밋

```bash
git add sm-module-api/src/main/java/com/tara/sm/common/config/SwaggerConfig.java
git commit -m "feat: Swagger/OpenAPI 3.0 설정 (JWT Bearer 인증 스키마 포함)"
```

---

## Task 6: Frontend 프로젝트 초기화

**Files:**
- `sm-module-web/package.json`
- `sm-module-web/vite.config.ts`
- `sm-module-web/tsconfig.json`
- `sm-module-web/tsconfig.node.json`
- `sm-module-web/index.html`
- `sm-module-web/src/main.tsx`
- `sm-module-web/src/vite-env.d.ts`
- `sm-module-web/.eslintrc.cjs`

### Steps

- [ ] 6.1 Vite + React + TypeScript 프로젝트 생성

```bash
npm create vite@latest sm-module-web -- --template react-ts
```

- [ ] 6.2 디렉토리 구조 생성

```bash
cd sm-module-web
mkdir -p src/api
mkdir -p src/components/layout
mkdir -p src/components/table
mkdir -p src/components/form
mkdir -p src/components/common
mkdir -p src/pages/home
mkdir -p src/pages/auth
mkdir -p src/pages/info
mkdir -p src/pages/order
mkdir -p src/pages/sales
mkdir -p src/pages/purchase
mkdir -p src/pages/stats
mkdir -p src/pages/process
mkdir -p src/hooks
mkdir -p src/store
mkdir -p src/types
mkdir -p src/routes
mkdir -p src/utils
```

- [ ] 6.3 `sm-module-web/package.json` 작성 (의존성 전체)

```json
{
  "name": "sm-module-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "antd": "^5.16.0",
    "@ant-design/icons": "^5.3.0",
    "zustand": "^4.5.0",
    "axios": "^1.6.8",
    "@tanstack/react-query": "^5.32.0",
    "@tanstack/react-table": "^8.16.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "react-hook-form": "^7.51.0",
    "@hookform/resolvers": "^3.3.4",
    "zod": "^3.23.0",
    "recharts": "^2.12.0",
    "xlsx": "^0.18.5",
    "dayjs": "^1.11.11"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.8.0",
    "@typescript-eslint/parser": "^7.8.0",
    "@vitejs/plugin-react": "^4.2.0",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.6",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] 6.4 패키지 설치

```bash
cd sm-module-web
npm install
# 기대 출력: added XXX packages
```

- [ ] 6.5 `sm-module-web/vite.config.ts` 작성

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // 백엔드 API 프록시 설정
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
```

- [ ] 6.6 `sm-module-web/tsconfig.json` 작성

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] 6.7 `sm-module-web/tsconfig.node.json` 작성

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] 6.8 `sm-module-web/index.html` 작성

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SM Module - 영업관리 시스템</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] 6.9 `sm-module-web/src/main.tsx` 작성

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] 6.10 `sm-module-web/src/vite-env.d.ts` 작성

```typescript
/// <reference types="vite/client" />
```

- [ ] 6.11 개발 서버 기동 확인

```bash
cd sm-module-web
npm run dev
# 기대 출력: VITE v5.x.x ready in XXms
#   ➜  Local: http://localhost:5173/
# Ctrl+C로 종료
```

- [ ] 6.12 Git 커밋

```bash
git add sm-module-web/
git commit -m "feat: React 18 프론트엔드 프로젝트 초기화 (Vite, TypeScript, Ant Design, Zustand)"
```

---

## Task 7: Axios 클라이언트 + JWT 인터셉터

**Files:**
- `sm-module-web/src/types/auth.ts`
- `sm-module-web/src/types/common.ts`
- `sm-module-web/src/store/authStore.ts`
- `sm-module-web/src/api/client.ts`
- `sm-module-web/src/api/auth.api.ts`

### Steps

- [ ] 7.1 `sm-module-web/src/types/common.ts` - 공통 타입 정의

```typescript
/** 서버 공통 API 응답 형식 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string | null;
  errorCode: string | null;
  timestamp: string;
}

/** 페이징 응답 */
export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

/** 페이징 요청 파라미터 */
export interface PageParams {
  page?: number;
  size?: number;
  sort?: string;
}

/** 기간 검색 파라미터 */
export interface DateRangeParams {
  startDate?: string;
  endDate?: string;
}

/** 셀렉트 옵션 (드롭다운용) */
export interface SelectOption {
  label: string;
  value: string | number;
}
```

- [ ] 7.2 `sm-module-web/src/types/auth.ts` - 인증 관련 타입

```typescript
/** 사용자 역할 */
export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

/** 사용자 상태 */
export type UserStatus = 'ACTIVE' | 'INACTIVE';

/** 로그인 사용자 정보 */
export interface User {
  id: number;
  employeeNo: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  status: UserStatus;
  departmentId: number | null;
  departmentName: string | null;
  division: string | null;
}

/** 로그인 요청 */
export interface LoginRequest {
  employeeNo: string;
  password: string;
}

/** 토큰 응답 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

/** 토큰 갱신 요청 */
export interface TokenRefreshRequest {
  refreshToken: string;
}
```

- [ ] 7.3 `sm-module-web/src/store/authStore.ts` - Zustand 인증 스토어

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/auth';

interface AuthState {
  /** JWT Access Token */
  accessToken: string | null;
  /** JWT Refresh Token */
  refreshToken: string | null;
  /** 로그인한 사용자 정보 */
  user: User | null;
  /** 인증 여부 */
  isAuthenticated: boolean;

  /** 로그인 성공 시 토큰 저장 */
  setTokens: (accessToken: string, refreshToken: string) => void;
  /** 사용자 정보 설정 */
  setUser: (user: User) => void;
  /** Access Token만 갱신 (refresh 시) */
  updateAccessToken: (accessToken: string, refreshToken: string) => void;
  /** 로그아웃 - 모든 상태 초기화 */
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (accessToken, refreshToken) =>
        set({
          accessToken,
          refreshToken,
          isAuthenticated: true,
        }),

      setUser: (user) =>
        set({ user }),

      updateAccessToken: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'sm-auth-storage', // localStorage 키
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

- [ ] 7.4 `sm-module-web/src/api/client.ts` - Axios 인스턴스 + JWT 인터셉터

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import type { ApiResponse, TokenResponse } from '@/types/common';

/**
 * Axios 인스턴스.
 * baseURL은 Vite proxy를 통해 백엔드로 전달된다.
 */
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** 토큰 갱신 중복 방지 플래그 */
let isRefreshing = false;
/** 토큰 갱신 대기 큐 */
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

/**
 * 대기 큐에 있는 요청들을 처리.
 */
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((pending) => {
    if (error) {
      pending.reject(error);
    } else {
      pending.resolve(token!);
    }
  });
  failedQueue = [];
};

/**
 * 요청 인터셉터: Authorization 헤더에 JWT Access Token 첨부.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * 응답 인터셉터:
 * - 401 응답 시 Refresh Token으로 Access Token 갱신 후 원래 요청 재시도.
 * - Refresh도 실패하면 로그아웃 처리.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401이 아니거나 이미 재시도한 요청이면 그대로 reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // 로그인/리프레시 요청 자체가 실패한 경우 → 로그아웃
    if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh')) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // 이미 토큰 갱신 중이면 큐에 추가
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { refreshToken } = useAuthStore.getState();
      if (!refreshToken) {
        throw new Error('리프레시 토큰 없음');
      }

      // Refresh Token으로 새 Access Token 요청
      const response = await axios.post<ApiResponse<TokenResponse>>('/api/auth/refresh', {
        refreshToken,
      });

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;

      // 스토어 갱신
      useAuthStore.getState().updateAccessToken(newAccessToken, newRefreshToken);

      // 대기 큐 처리
      processQueue(null, newAccessToken);

      // 원래 요청 재시도
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
```

- [ ] 7.5 `sm-module-web/src/api/auth.api.ts` - 인증 API 함수

```typescript
import apiClient from './client';
import type { ApiResponse } from '@/types/common';
import type { LoginRequest, TokenResponse, TokenRefreshRequest, User } from '@/types/auth';

/**
 * 로그인 API
 */
export const login = async (data: LoginRequest): Promise<TokenResponse> => {
  const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/login', data);
  return response.data.data;
};

/**
 * 토큰 갱신 API
 */
export const refreshToken = async (data: TokenRefreshRequest): Promise<TokenResponse> => {
  const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/refresh', data);
  return response.data.data;
};

/**
 * 로그아웃 API
 */
export const logout = async (): Promise<void> => {
  await apiClient.post('/auth/logout');
};

/**
 * 내 정보 조회 API
 */
export const getMe = async (): Promise<User> => {
  const response = await apiClient.get<ApiResponse<User>>('/auth/me');
  return response.data.data;
};
```

- [ ] 7.6 빌드 확인

```bash
cd sm-module-web
npx tsc --noEmit
# 기대 출력: 에러 없음
```

- [ ] 7.7 Git 커밋

```bash
git add sm-module-web/src/types/ sm-module-web/src/store/ sm-module-web/src/api/
git commit -m "feat: Axios 클라이언트, JWT 인터셉터, 인증 스토어 구현"
```

---

## Task 8: 공용 레이아웃 컴포넌트

**Files:**
- `sm-module-web/src/components/layout/AppHeader.tsx`
- `sm-module-web/src/components/layout/AppSidebar.tsx`
- `sm-module-web/src/components/layout/PageLayout.tsx`
- `sm-module-web/src/components/layout/Breadcrumb.tsx`
- `sm-module-web/src/components/layout/index.ts`

### Steps

- [ ] 8.1 `sm-module-web/src/components/layout/AppHeader.tsx`

```tsx
import React, { useState } from 'react';
import { Layout, Menu, Dropdown, Button, Space, Typography, Avatar } from 'antd';
import {
  MenuOutlined,
  UserOutlined,
  LogoutOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { logout as logoutApi } from '@/api/auth.api';
import AppSidebar from './AppSidebar';

const { Header } = Layout;
const { Text } = Typography;

/** GNB 메뉴 구조 정의 */
const menuConfig = [
  {
    key: 'info',
    label: '정보관리',
    children: [
      { key: '/info/biz-owners', label: '사업자관리' },
      { key: '/info/customers', label: '고객관리' },
      { key: '/info/part-goals', label: '파트 목표 입력' },
      { key: '/info/am-goals', label: 'AM 목표 입력' },
    ],
  },
  {
    key: 'order',
    label: '주문관리',
    children: [
      { key: '/orders', label: '주문목록' },
      { key: '/orders/create', label: '주문등록' },
    ],
  },
  {
    key: 'sales',
    label: '매출관리',
    children: [
      { key: '/sales', label: '매출목록' },
      { key: '/sales/card', label: '카드매출목록' },
      { key: '/sales/pre', label: '선매출목록' },
      { key: '/sales/pre/create', label: '선매출입력' },
      { key: '/sales/untact/create', label: '비대면주문 등록' },
      { key: '/sales/untact', label: '비대면주문 목록' },
      { key: '/sales/untact/settlement', label: '비대면 정산' },
      { key: '/sales/tax/issue', label: '세금계산서발행' },
      { key: '/sales/tax', label: '세금계산서 발행목록' },
    ],
  },
  {
    key: 'purchase',
    label: '매입마감',
    children: [
      { key: '/purchase/outsourcing-po', label: '외주발주목록' },
      { key: '/purchase/outsourcing-settlement', label: '외주정산등록' },
    ],
  },
  {
    key: 'stats',
    label: '통계',
    children: [
      { key: '/stats/team-forecast', label: '본부/팀 예상매출' },
      { key: '/stats/team-goal-actual', label: '매출목표 및 실적' },
      { key: '/stats/part-goal-yoy', label: '파트별 전년대비' },
      { key: '/stats/am-goal-yoy', label: 'AM 전년대비' },
      { key: '/stats/item-perf', label: '품목별 실적조회' },
      { key: '/stats/vendor-margin', label: '거래처별 외주 마진율' },
      { key: '/stats/order-margin', label: '주문건별 외주 마진율' },
    ],
  },
];

const AppHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout: logoutStore } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 현재 경로에 매칭되는 상위 메뉴 키 찾기
  const getSelectedTopKey = (): string => {
    const path = location.pathname;
    for (const menu of menuConfig) {
      if (menu.children.some((child) => path.startsWith(child.key))) {
        return menu.key;
      }
    }
    return '';
  };

  // 로그아웃 처리
  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {
      // 실패해도 로컬 상태는 정리
    } finally {
      logoutStore();
      navigate('/login');
    }
  };

  // 사용자 메뉴 드롭다운
  const userMenuItems = [
    {
      key: 'logout',
      label: '로그아웃',
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];

  // Desktop GNB 메뉴 아이템 생성
  const topMenuItems = menuConfig.map((menu) => ({
    key: menu.key,
    label: (
      <Dropdown
        menu={{
          items: menu.children.map((child) => ({
            key: child.key,
            label: child.label,
            onClick: () => navigate(child.key),
          })),
        }}
        trigger={['hover']}
      >
        <span>
          {menu.label} <DownOutlined style={{ fontSize: 10 }} />
        </span>
      </Dropdown>
    ),
  }));

  return (
    <>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
          padding: '0 24px',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 56,
        }}
      >
        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* 모바일 햄버거 메뉴 */}
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            className="mobile-menu-btn"
            style={{ display: 'none' }}
          />
          <Text
            strong
            style={{ fontSize: 18, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            SM Module
          </Text>
        </div>

        {/* Desktop 네비게이션 */}
        <Menu
          mode="horizontal"
          selectedKeys={[getSelectedTopKey()]}
          items={topMenuItems}
          style={{ flex: 1, border: 'none', marginLeft: 32 }}
          className="desktop-nav"
        />

        {/* 사용자 정보 */}
        <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar size="small" icon={<UserOutlined />} />
            <Text>
              {user?.departmentName && `${user.departmentName} / `}
              {user?.name || '사용자'}
            </Text>
          </Space>
        </Dropdown>
      </Header>

      {/* 모바일 사이드바 (드로어) */}
      <AppSidebar
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        menuConfig={menuConfig}
      />

      {/* 반응형 스타일 */}
      <style>{`
        @media (max-width: 767px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: inline-flex !important; }
        }
        @media (min-width: 768px) {
          .mobile-menu-btn { display: none !important; }
        }
      `}</style>
    </>
  );
};

export default AppHeader;
```

- [ ] 8.2 `sm-module-web/src/components/layout/AppSidebar.tsx`

```tsx
import React from 'react';
import { Drawer, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';

interface MenuItem {
  key: string;
  label: string;
  children?: { key: string; label: string }[];
}

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
  menuConfig: MenuItem[];
}

/**
 * 모바일 사이드바 (Drawer 네비게이션).
 * 768px 미만에서 햄버거 메뉴 클릭 시 열린다.
 */
const AppSidebar: React.FC<AppSidebarProps> = ({ open, onClose, menuConfig }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = menuConfig.map((menu) => ({
    key: menu.key,
    label: menu.label,
    children: menu.children?.map((child) => ({
      key: child.key,
      label: child.label,
    })),
  }));

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    onClose();
  };

  return (
    <Drawer
      title="SM Module"
      placement="left"
      onClose={onClose}
      open={open}
      width={280}
    >
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ border: 'none' }}
      />
    </Drawer>
  );
};

export default AppSidebar;
```

- [ ] 8.3 `sm-module-web/src/components/layout/Breadcrumb.tsx`

```tsx
import React from 'react';
import { Breadcrumb as AntBreadcrumb } from 'antd';
import { useLocation, Link } from 'react-router-dom';

/** 경로 → 라벨 매핑 테이블 */
const pathLabels: Record<string, string> = {
  '/': '홈',
  '/info': '정보관리',
  '/info/biz-owners': '사업자관리',
  '/info/customers': '고객관리',
  '/info/part-goals': '파트 목표 입력',
  '/info/am-goals': 'AM 목표 입력',
  '/orders': '주문목록',
  '/orders/create': '주문등록',
  '/sales': '매출목록',
  '/sales/card': '카드매출목록',
  '/sales/pre': '선매출목록',
  '/sales/pre/create': '선매출입력',
  '/sales/untact': '비대면주문 목록',
  '/sales/untact/create': '비대면주문 등록',
  '/sales/untact/settlement': '비대면 정산',
  '/sales/tax': '세금계산서 발행목록',
  '/sales/tax/issue': '세금계산서발행',
  '/purchase': '매입마감',
  '/purchase/outsourcing-po': '외주발주목록',
  '/purchase/outsourcing-settlement': '외주정산등록',
  '/stats': '통계',
  '/stats/team-forecast': '본부/팀 예상매출',
  '/stats/team-goal-actual': '매출목표 및 실적',
  '/stats/part-goal-yoy': '파트별 전년대비',
  '/stats/am-goal-yoy': 'AM 전년대비',
  '/stats/item-perf': '품목별 실적조회',
  '/stats/vendor-margin': '거래처별 외주 마진율',
  '/stats/order-margin': '주문건별 외주 마진율',
};

const AppBreadcrumb: React.FC = () => {
  const location = useLocation();

  // 현재 경로를 세그먼트로 분리하여 브레드크럼 항목 생성
  const buildBreadcrumbItems = () => {
    const segments = location.pathname.split('/').filter(Boolean);
    const items: { title: React.ReactNode }[] = [
      { title: <Link to="/">홈</Link> },
    ];

    let currentPath = '';
    for (const segment of segments) {
      currentPath += `/${segment}`;
      const label = pathLabels[currentPath];
      if (label) {
        items.push({
          title: currentPath === location.pathname
            ? label
            : <Link to={currentPath}>{label}</Link>,
        });
      }
    }

    return items;
  };

  return (
    <div
      style={{
        background: '#1890ff',
        padding: '8px 24px',
        marginBottom: 0,
      }}
    >
      <AntBreadcrumb
        items={buildBreadcrumbItems()}
        style={{ color: '#fff' }}
      />
      <style>{`
        .ant-breadcrumb,
        .ant-breadcrumb a,
        .ant-breadcrumb li,
        .ant-breadcrumb-separator {
          color: rgba(255, 255, 255, 0.85) !important;
        }
        .ant-breadcrumb li:last-child {
          color: #fff !important;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default AppBreadcrumb;
```

- [ ] 8.4 `sm-module-web/src/components/layout/PageLayout.tsx`

```tsx
import React from 'react';
import { Layout } from 'antd';
import AppHeader from './AppHeader';
import AppBreadcrumb from './Breadcrumb';

const { Content } = Layout;

interface PageLayoutProps {
  children: React.ReactNode;
}

/**
 * 공용 페이지 레이아웃.
 * Header + Breadcrumb + Content 영역으로 구성된다.
 */
const PageLayout: React.FC<PageLayoutProps> = ({ children }) => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader />
      <AppBreadcrumb />
      <Content
        style={{
          padding: '24px',
          maxWidth: 1400,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {children}
      </Content>
    </Layout>
  );
};

export default PageLayout;
```

- [ ] 8.5 `sm-module-web/src/components/layout/index.ts` - 배럴 export

```typescript
export { default as AppHeader } from './AppHeader';
export { default as AppSidebar } from './AppSidebar';
export { default as AppBreadcrumb } from './Breadcrumb';
export { default as PageLayout } from './PageLayout';
```

- [ ] 8.6 Git 커밋

```bash
git add sm-module-web/src/components/layout/
git commit -m "feat: 공용 레이아웃 컴포넌트 (AppHeader, AppSidebar, Breadcrumb, PageLayout)"
```

---

## Task 9: 공용 테이블/폼 컴포넌트

**Files:**
- `sm-module-web/src/components/table/DataTable.tsx`
- `sm-module-web/src/components/table/ExcelDownloadBtn.tsx`
- `sm-module-web/src/components/table/index.ts`
- `sm-module-web/src/components/form/SearchBar.tsx`
- `sm-module-web/src/components/form/DateRangePicker.tsx`
- `sm-module-web/src/components/form/SelectFilter.tsx`
- `sm-module-web/src/components/form/SearchPopup.tsx`
- `sm-module-web/src/components/form/index.ts`

### Steps

- [ ] 9.1 `sm-module-web/src/components/table/DataTable.tsx`

```tsx
import React, { useMemo } from 'react';
import { Table, TableProps } from 'antd';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';

interface DataTableProps<T> {
  /** TanStack Table 컬럼 정의 */
  columns: ColumnDef<T, unknown>[];
  /** 테이블 데이터 */
  data: T[];
  /** 로딩 상태 */
  loading?: boolean;
  /** 총 데이터 건수 (서버 페이징 시) */
  totalElements?: number;
  /** 현재 페이지 (0-based) */
  page?: number;
  /** 페이지 크기 */
  pageSize?: number;
  /** 페이지 변경 핸들러 */
  onPageChange?: (page: number, pageSize: number) => void;
  /** 정렬 상태 */
  sorting?: SortingState;
  /** 정렬 변경 핸들러 */
  onSortingChange?: (sorting: SortingState) => void;
  /** 행 클릭 핸들러 */
  onRowClick?: (record: T) => void;
  /** 행 키 추출 함수 */
  rowKey?: (record: T) => string | number;
  /** 스크롤 설정 */
  scroll?: TableProps<T>['scroll'];
  /** 하단 요약 행 렌더링 */
  summary?: TableProps<T>['summary'];
}

/**
 * 공용 데이터 테이블 컴포넌트.
 * TanStack Table의 컬럼 정의를 Ant Design Table에 매핑하여 렌더링한다.
 */
function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  totalElements,
  page = 0,
  pageSize = 10,
  onPageChange,
  sorting,
  onSortingChange,
  onRowClick,
  rowKey,
  scroll,
  summary,
}: DataTableProps<T>) {
  // TanStack Table 인스턴스
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting || [],
    },
    onSortingChange: onSortingChange
      ? (updater) => {
          const newSorting = typeof updater === 'function'
            ? updater(sorting || [])
            : updater;
          onSortingChange(newSorting);
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: !!onPageChange,
    manualSorting: !!onSortingChange,
  });

  // TanStack 컬럼 → Ant Design 컬럼 변환
  const antColumns = useMemo(() => {
    return table.getAllColumns().map((col) => ({
      key: col.id,
      title: typeof col.columnDef.header === 'string'
        ? col.columnDef.header
        : col.id,
      dataIndex: col.id,
      sorter: col.getCanSort(),
      sortOrder: col.getIsSorted()
        ? col.getIsSorted() === 'asc' ? 'ascend' as const : 'descend' as const
        : undefined,
      render: (_: unknown, record: T, index: number) => {
        const row = table.getRowModel().rows[index];
        if (!row) return null;
        const cell = row.getAllCells().find((c) => c.column.id === col.id);
        if (!cell) return null;
        return flexRender(cell.column.columnDef.cell, cell.getContext());
      },
    }));
  }, [table, sorting]);

  return (
    <Table
      columns={antColumns}
      dataSource={data}
      loading={loading}
      rowKey={rowKey || ((record: T) => String((record as Record<string, unknown>).id ?? Math.random()))}
      scroll={scroll || { x: 'max-content' }}
      summary={summary}
      onRow={onRowClick ? (record) => ({
        onClick: () => onRowClick(record),
        style: { cursor: 'pointer' },
      }) : undefined}
      pagination={
        onPageChange
          ? {
              current: page + 1,
              pageSize,
              total: totalElements,
              showSizeChanger: true,
              showTotal: (total) => `총 ${total}건`,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (newPage, newSize) => onPageChange(newPage - 1, newSize),
            }
          : {
              pageSize,
              showSizeChanger: true,
              showTotal: (total) => `총 ${total}건`,
            }
      }
      size="middle"
    />
  );
}

export default DataTable;
```

- [ ] 9.2 `sm-module-web/src/components/table/ExcelDownloadBtn.tsx`

```tsx
import React from 'react';
import { Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

interface ExcelColumn {
  /** 엑셀 헤더 이름 */
  header: string;
  /** 데이터 객체의 키 */
  key: string;
  /** 값 포맷터 (선택) */
  formatter?: (value: unknown) => string | number;
}

interface ExcelDownloadBtnProps {
  /** 엑셀에 출력할 데이터 */
  data: Record<string, unknown>[];
  /** 컬럼 정의 */
  columns: ExcelColumn[];
  /** 파일명 (확장자 제외) */
  fileName: string;
  /** 시트명 */
  sheetName?: string;
  /** 버튼 텍스트 */
  label?: string;
  /** 로딩 상태 */
  loading?: boolean;
}

/**
 * 엑셀 다운로드 버튼.
 * SheetJS(xlsx)를 사용하여 현재 데이터를 .xlsx 파일로 내보낸다.
 */
const ExcelDownloadBtn: React.FC<ExcelDownloadBtnProps> = ({
  data,
  columns,
  fileName,
  sheetName = 'Sheet1',
  label = '엑셀다운로드',
  loading = false,
}) => {
  const handleDownload = () => {
    if (data.length === 0) {
      message.warning('다운로드할 데이터가 없습니다.');
      return;
    }

    try {
      // 헤더 행
      const headers = columns.map((col) => col.header);

      // 데이터 행 생성
      const rows = data.map((row) =>
        columns.map((col) => {
          const value = row[col.key];
          return col.formatter ? col.formatter(value) : value;
        })
      );

      // 워크시트 생성
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // 컬럼 너비 자동 조정
      worksheet['!cols'] = columns.map((col) => ({
        wch: Math.max(col.header.length * 2, 12),
      }));

      // 워크북 생성 및 다운로드
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${fileName}.xlsx`);

      message.success('엑셀 파일이 다운로드되었습니다.');
    } catch {
      message.error('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  return (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleDownload}
      loading={loading}
    >
      {label}
    </Button>
  );
};

export default ExcelDownloadBtn;
```

- [ ] 9.3 `sm-module-web/src/components/table/index.ts`

```typescript
export { default as DataTable } from './DataTable';
export { default as ExcelDownloadBtn } from './ExcelDownloadBtn';
```

- [ ] 9.4 `sm-module-web/src/components/form/SearchBar.tsx`

```tsx
import React, { useState } from 'react';
import { Input, Button, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface SearchBarProps {
  /** 검색 실행 콜백 */
  onSearch: (keyword: string) => void;
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 초기값 */
  defaultValue?: string;
  /** 너비 */
  width?: number | string;
  /** 로딩 상태 */
  loading?: boolean;
}

/**
 * 키워드 검색바.
 * 입력 + Enter 또는 검색 버튼 클릭으로 검색 실행.
 */
const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  placeholder = '검색어를 입력하세요',
  defaultValue = '',
  width = 300,
  loading = false,
}) => {
  const [keyword, setKeyword] = useState(defaultValue);

  const handleSearch = () => {
    onSearch(keyword.trim());
  };

  return (
    <Space.Compact style={{ width }}>
      <Input
        placeholder={placeholder}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onPressEnter={handleSearch}
        allowClear
        onClear={() => {
          setKeyword('');
          onSearch('');
        }}
      />
      <Button
        type="primary"
        icon={<SearchOutlined />}
        onClick={handleSearch}
        loading={loading}
      >
        조회
      </Button>
    </Space.Compact>
  );
};

export default SearchBar;
```

- [ ] 9.5 `sm-module-web/src/components/form/DateRangePicker.tsx`

```tsx
import React from 'react';
import { DatePicker, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface DateRangePickerProps {
  /** 라벨 텍스트 */
  label?: string;
  /** 선택된 범위 [시작일, 종료일] */
  value?: [string | null, string | null];
  /** 범위 변경 콜백 */
  onChange: (dates: [string | null, string | null]) => void;
  /** 날짜 형식 */
  format?: string;
}

/**
 * 기간 선택 컴포넌트.
 * Ant Design RangePicker를 래핑하여 문자열(YYYY-MM-DD) 입출력을 지원한다.
 */
const DateRangePicker: React.FC<DateRangePickerProps> = ({
  label = '기간',
  value,
  onChange,
  format = 'YYYY-MM-DD',
}) => {
  // 문자열 → Dayjs 변환
  const dayjsValue: [Dayjs | null, Dayjs | null] | undefined = value
    ? [
        value[0] ? dayjs(value[0], format) : null,
        value[1] ? dayjs(value[1], format) : null,
      ]
    : undefined;

  const handleChange = (
    dates: [Dayjs | null, Dayjs | null] | null,
  ) => {
    if (dates) {
      onChange([
        dates[0] ? dates[0].format(format) : null,
        dates[1] ? dates[1].format(format) : null,
      ]);
    } else {
      onChange([null, null]);
    }
  };

  return (
    <Space>
      {label && <Text>{label}</Text>}
      <RangePicker
        value={dayjsValue}
        onChange={handleChange}
        format={format}
        allowClear
        style={{ width: 260 }}
      />
    </Space>
  );
};

export default DateRangePicker;
```

- [ ] 9.6 `sm-module-web/src/components/form/SelectFilter.tsx`

```tsx
import React from 'react';
import { Select, Space, Typography } from 'antd';
import type { SelectOption } from '@/types/common';

const { Text } = Typography;

interface SelectFilterProps {
  /** 라벨 텍스트 */
  label?: string;
  /** 선택 옵션 목록 */
  options: SelectOption[];
  /** 현재 선택된 값 */
  value?: string | number;
  /** 변경 콜백 */
  onChange: (value: string | number) => void;
  /** placeholder */
  placeholder?: string;
  /** 너비 */
  width?: number | string;
  /** 전체 선택 옵션 자동 추가 여부 */
  showAll?: boolean;
  /** "전체" 라벨 */
  allLabel?: string;
}

/**
 * 드롭다운 필터 셀렉트.
 * 목록 화면의 필터 드롭다운으로 사용한다.
 */
const SelectFilter: React.FC<SelectFilterProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = '선택',
  width = 160,
  showAll = true,
  allLabel = '전체',
}) => {
  const allOptions: SelectOption[] = showAll
    ? [{ label: allLabel, value: '' }, ...options]
    : options;

  return (
    <Space>
      {label && <Text>{label}</Text>}
      <Select
        value={value}
        onChange={onChange}
        options={allOptions.map((opt) => ({
          label: opt.label,
          value: opt.value,
        }))}
        placeholder={placeholder}
        style={{ width }}
      />
    </Space>
  );
};

export default SelectFilter;
```

- [ ] 9.7 `sm-module-web/src/components/form/SearchPopup.tsx`

```tsx
import React, { useState, useCallback } from 'react';
import { Modal, Input, Table, Button, Space, Typography, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

interface SearchPopupProps<T> {
  /** 모달 제목 */
  title: string;
  /** 표시 여부 */
  open: boolean;
  /** 닫기 콜백 */
  onClose: () => void;
  /** 행 선택 콜백 */
  onSelect: (record: T) => void;
  /** Ant Design 컬럼 정의 */
  columns: ColumnsType<T>;
  /** 검색 API 호출 함수 */
  fetchData: (keyword: string) => Promise<T[]>;
  /** 검색 placeholder */
  placeholder?: string;
  /** 행 키 */
  rowKey?: string | ((record: T) => string);
}

/**
 * 검색 팝업 모달.
 * 키워드 입력 → API 검색 → 테이블 결과 → 행 선택의 패턴을 제공한다.
 * 고객명, 회사명, 영업담당자 등의 검색에 사용.
 */
function SearchPopup<T extends Record<string, unknown>>({
  title,
  open,
  onClose,
  onSelect,
  columns,
  fetchData,
  placeholder = '검색어를 입력하세요 (2자 이상)',
  rowKey = 'id',
}: SearchPopupProps<T>) {
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (keyword.trim().length < 2) {
      return;
    }
    setLoading(true);
    try {
      const result = await fetchData(keyword.trim());
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [keyword, fetchData]);

  const handleRowClick = (record: T) => {
    onSelect(record);
    handleClose();
  };

  const handleClose = () => {
    setKeyword('');
    setData([]);
    onClose();
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={700}
      destroyOnClose
    >
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          placeholder={placeholder}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          allowClear
        />
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={loading}
        >
          검색
        </Button>
      </Space.Compact>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey={rowKey}
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: <Empty description="검색 결과가 없습니다." /> }}
        onRow={(record) => ({
          onClick: () => handleRowClick(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        행을 클릭하여 선택하세요.
      </Typography.Text>
    </Modal>
  );
}

export default SearchPopup;
```

- [ ] 9.8 `sm-module-web/src/components/form/index.ts`

```typescript
export { default as SearchBar } from './SearchBar';
export { default as DateRangePicker } from './DateRangePicker';
export { default as SelectFilter } from './SelectFilter';
export { default as SearchPopup } from './SearchPopup';
```

- [ ] 9.9 Git 커밋

```bash
git add sm-module-web/src/components/table/ sm-module-web/src/components/form/
git commit -m "feat: 공용 테이블/폼 컴포넌트 (DataTable, ExcelDownloadBtn, SearchBar, DateRangePicker, SelectFilter, SearchPopup)"
```

---

## Task 10: 라우팅 + 인증 가드 + 로그인 페이지

**Files:**
- `sm-module-web/src/components/common/ProtectedRoute.tsx`
- `sm-module-web/src/routes/index.tsx`
- `sm-module-web/src/pages/auth/LoginPage.tsx`
- `sm-module-web/src/pages/home/DashboardPage.tsx`
- `sm-module-web/src/App.tsx`

### Steps

- [ ] 10.1 `sm-module-web/src/components/common/ProtectedRoute.tsx`

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * 인증 가드 컴포넌트.
 * 미인증 사용자를 /login으로 리다이렉트한다.
 * 인증 후 원래 요청 경로로 복귀할 수 있도록 state에 현재 위치를 전달한다.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
```

- [ ] 10.2 `sm-module-web/src/pages/auth/LoginPage.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Checkbox, Typography, message, Layout } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { login as loginApi, getMe } from '@/api/auth.api';

const { Title, Text } = Typography;

interface LoginFormValues {
  employeeNo: string;
  password: string;
  remember: boolean;
}

const REMEMBER_KEY = 'sm-remember-employee-no';

/**
 * 로그인 페이지.
 * 사원번호 + 비밀번호 입력 → JWT 토큰 발급 → 대시보드 이동.
 */
const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTokens, setUser, isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<LoginFormValues>();

  // 이미 인증되어 있으면 대시보드로 이동
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // 저장된 사원번호 복원
  useEffect(() => {
    const savedEmployeeNo = localStorage.getItem(REMEMBER_KEY);
    if (savedEmployeeNo) {
      form.setFieldsValue({ employeeNo: savedEmployeeNo, remember: true });
    }
  }, [form]);

  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      // 로그인 API 호출
      const tokenResponse = await loginApi({
        employeeNo: values.employeeNo,
        password: values.password,
      });

      // 토큰 저장
      setTokens(tokenResponse.accessToken, tokenResponse.refreshToken);

      // 사원번호 기억하기
      if (values.remember) {
        localStorage.setItem(REMEMBER_KEY, values.employeeNo);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      // 사용자 정보 조회
      const user = await getMe();
      setUser(user);

      message.success(`${user.name}님 환영합니다.`);

      // 원래 요청 경로로 이동
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch {
      message.error('사원번호 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{
          width: 400,
          maxWidth: '90vw',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 4 }}>SM Module</Title>
          <Text type="secondary">영업관리 시스템</Text>
        </div>

        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          autoComplete="off"
          initialValues={{ remember: false }}
        >
          <Form.Item
            name="employeeNo"
            label="사원번호"
            rules={[{ required: true, message: '사원번호를 입력하세요.' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="사원번호"
              size="large"
              autoFocus
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="비밀번호"
            rules={[{ required: true, message: '비밀번호를 입력하세요.' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="비밀번호"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>사원번호 기억하기</Checkbox>
              </Form.Item>
              <Button type="link" size="small" style={{ padding: 0 }}>
                비밀번호 분실
              </Button>
            </div>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              로그인
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Layout>
  );
};

export default LoginPage;
```

- [ ] 10.3 `sm-module-web/src/pages/home/DashboardPage.tsx` (임시)

```tsx
import React from 'react';
import { Typography, Card, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '@/components/layout';

const { Title, Paragraph } = Typography;

/**
 * 대시보드 페이지 (임시).
 * Phase 2에서 매출 추이 차트 등 실제 콘텐츠를 구현한다.
 */
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageLayout>
      <Title level={3}>대시보드</Title>
      <Card>
        <Paragraph>SM Module 영업관리 시스템에 오신 것을 환영합니다.</Paragraph>
        <Paragraph type="secondary">
          매출 추이 차트 및 주요 지표는 Phase 2에서 구현됩니다.
        </Paragraph>
        <Button type="primary" onClick={() => navigate('/process')}>
          프로세스 보기
        </Button>
      </Card>
    </PageLayout>
  );
};

export default DashboardPage;
```

- [ ] 10.4 `sm-module-web/src/routes/index.tsx` - 전체 라우트 정의

```tsx
import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Spin } from 'antd';
import ProtectedRoute from '@/components/common/ProtectedRoute';

// Lazy 로딩 컴포넌트
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/home/DashboardPage'));

// 정보관리 (Phase 2에서 구현 예정, 임시 placeholder)
const PlaceholderPage = lazy(() =>
  Promise.resolve({
    default: () => {
      const { PageLayout } = require('@/components/layout');
      return (
        <PageLayout>
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <h2>준비 중</h2>
            <p>이 페이지는 다음 Phase에서 구현됩니다.</p>
          </div>
        </PageLayout>
      );
    },
  })
);

/** 로딩 스피너 */
const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" tip="로딩 중..." />
  </div>
);

/** 인증 필수 라우트 래퍼 */
const Protected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <Suspense fallback={<Loading />}>
      {children}
    </Suspense>
  </ProtectedRoute>
);

const router = createBrowserRouter([
  // 인증 불필요
  {
    path: '/login',
    element: (
      <Suspense fallback={<Loading />}>
        <LoginPage />
      </Suspense>
    ),
  },
  // 인증 필수
  {
    path: '/',
    element: <Protected><DashboardPage /></Protected>,
  },
  // 정보관리
  {
    path: '/info/biz-owners',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/info/customers',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/info/part-goals',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/info/am-goals',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  // 주문관리
  {
    path: '/orders',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/orders/create',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/orders/:id',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  // 매출관리
  {
    path: '/sales',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/card',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/pre',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/pre/create',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/untact',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/untact/create',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/untact/settlement',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/tax/issue',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/sales/tax',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  // 매입마감
  {
    path: '/purchase/outsourcing-po',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/purchase/outsourcing-settlement',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  // 통계
  {
    path: '/stats/team-forecast',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/stats/team-goal-actual',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/stats/part-goal-yoy',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/stats/am-goal-yoy',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/stats/item-perf',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/stats/vendor-margin',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  {
    path: '/stats/order-margin',
    element: <Protected><PlaceholderPage /></Protected>,
  },
  // 프로세스 흐름도
  {
    path: '/process',
    element: <Protected><PlaceholderPage /></Protected>,
  },
]);

const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default AppRouter;
```

- [ ] 10.5 `sm-module-web/src/App.tsx` - 앱 진입점 (Provider 구성)

```tsx
import React from 'react';
import { ConfigProvider } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import koKR from 'antd/locale/ko_KR';
import AppRouter from '@/routes';

// React Query 클라이언트 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5분
    },
  },
});

/**
 * 앱 루트 컴포넌트.
 * - QueryClientProvider: React Query 전역 설정
 * - ConfigProvider: Ant Design 한국어 로케일 + 테마
 * - AppRouter: 라우팅
 */
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={koKR}
        theme={{
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 6,
          },
        }}
      >
        <AppRouter />
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default App;
```

- [ ] 10.6 빌드 확인

```bash
cd sm-module-web
npx tsc --noEmit
# 기대 출력: 에러 없음
```

- [ ] 10.7 Git 커밋

```bash
git add sm-module-web/src/components/common/ sm-module-web/src/routes/ sm-module-web/src/pages/ sm-module-web/src/App.tsx
git commit -m "feat: 라우팅, 인증 가드, 로그인 페이지, App 진입점 구현"
```

---

## Task 11: 유틸리티

**Files:**
- `sm-module-web/src/utils/format.ts`
- `sm-module-web/src/utils/number.ts`
- `sm-module-web/src/hooks/useAuth.ts`
- `sm-module-web/src/hooks/useTable.ts`

### Steps

- [ ] 11.1 `sm-module-web/src/utils/format.ts`

```typescript
import dayjs from 'dayjs';

/**
 * 금액을 원화 형식으로 포맷 (1,234,567).
 * null/undefined는 '0'을 반환한다.
 */
export const formatCurrency = (value: number | null | undefined): string => {
  if (value == null) return '0';
  return value.toLocaleString('ko-KR');
};

/**
 * 금액 + '원' 표시 (예: 1,234,567원).
 */
export const formatCurrencyWon = (value: number | null | undefined): string => {
  return `${formatCurrency(value)}원`;
};

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷.
 */
export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD');
};

/**
 * 날짜시간을 YYYY-MM-DD HH:mm 형식으로 포맷.
 */
export const formatDateTime = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD HH:mm');
};

/**
 * 날짜시간을 YYYY-MM-DD HH:mm:ss 형식으로 포맷.
 */
export const formatDateTimeFull = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
};
```

- [ ] 11.2 `sm-module-web/src/utils/number.ts`

```typescript
/**
 * 주문번호 표시용 포맷 (실제 번호 생성은 백엔드에서 수행).
 * 프론트엔드에서는 표시용으로만 사용한다.
 *
 * 형식: O{YYMMDD}-{부서코드4자리}-{일련번호5자리}
 * 예: O260303-0040-00001
 */
export const formatOrderNo = (orderNo: string): string => {
  return orderNo; // 이미 포맷된 상태로 서버에서 내려옴
};

/**
 * 숫자를 지정된 자릿수로 패딩.
 * 예: padNumber(42, 5) → '00042'
 */
export const padNumber = (num: number, length: number): string => {
  return String(num).padStart(length, '0');
};

/**
 * 문자열에서 숫자만 추출.
 * 금액 입력 필드에서 콤마 제거 등에 사용.
 */
export const extractNumber = (value: string): number => {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * 퍼센트 계산 (소수점 1자리).
 * 예: calcPercentage(75, 100) → 75.0
 */
export const calcPercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 1000) / 10;
};
```

- [ ] 11.3 `sm-module-web/src/hooks/useAuth.ts`

```typescript
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { logout as logoutApi, getMe } from '@/api/auth.api';
import type { Role } from '@/types/auth';

/**
 * 인증 관련 편의 훅.
 * authStore를 래핑하여 로그인/로그아웃/권한 확인 기능을 제공한다.
 */
export const useAuth = () => {
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    accessToken,
    setUser,
    logout: logoutStore,
  } = useAuthStore();

  /** 로그아웃 */
  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        await logoutApi();
      }
    } catch {
      // API 실패해도 로컬 상태는 정리
    } finally {
      logoutStore();
      navigate('/login');
    }
  }, [accessToken, logoutStore, navigate]);

  /** 사용자 정보 새로고침 */
  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await getMe();
      setUser(freshUser);
      return freshUser;
    } catch {
      return null;
    }
  }, [setUser]);

  /** 역할 확인 */
  const hasRole = useCallback(
    (role: Role): boolean => {
      return user?.role === role;
    },
    [user]
  );

  /** ADMIN 여부 */
  const isAdmin = user?.role === 'ADMIN';

  /** MANAGER 이상 여부 */
  const isManagerOrAbove = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  return {
    user,
    isAuthenticated,
    isAdmin,
    isManagerOrAbove,
    logout,
    refreshUser,
    hasRole,
  };
};
```

- [ ] 11.4 `sm-module-web/src/hooks/useTable.ts`

```typescript
import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortingState } from '@tanstack/react-table';

interface UseTableOptions {
  /** 초기 페이지 크기 */
  defaultPageSize?: number;
  /** URL 파라미터 동기화 여부 */
  syncUrl?: boolean;
}

interface UseTableReturn {
  /** 현재 페이지 (0-based) */
  page: number;
  /** 페이지 크기 */
  pageSize: number;
  /** 검색 키워드 */
  keyword: string;
  /** 정렬 상태 */
  sorting: SortingState;
  /** 기간 필터 [시작일, 종료일] */
  dateRange: [string | null, string | null];
  /** 페이지 변경 */
  onPageChange: (page: number, pageSize: number) => void;
  /** 검색 키워드 변경 */
  onKeywordChange: (keyword: string) => void;
  /** 정렬 변경 */
  onSortingChange: (sorting: SortingState) => void;
  /** 기간 변경 */
  onDateRangeChange: (range: [string | null, string | null]) => void;
  /** 검색 파라미터 초기화 */
  reset: () => void;
  /** 서버 요청용 파라미터 객체 */
  queryParams: Record<string, string | number | undefined>;
}

/**
 * 테이블 상태 관리 훅.
 * 페이징, 정렬, 검색, 기간 필터 상태를 통합 관리한다.
 * syncUrl=true 시 URL SearchParams와 동기화된다.
 */
export const useTable = (options: UseTableOptions = {}): UseTableReturn => {
  const { defaultPageSize = 10, syncUrl = false } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  // URL 동기화 시 초기값을 URL에서 읽기
  const initialPage = syncUrl ? Number(searchParams.get('page') || 0) : 0;
  const initialSize = syncUrl ? Number(searchParams.get('size') || defaultPageSize) : defaultPageSize;
  const initialKeyword = syncUrl ? (searchParams.get('keyword') || '') : '';

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialSize);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [dateRange, setDateRange] = useState<[string | null, string | null]>([null, null]);

  // URL 파라미터 업데이트
  const updateUrl = useCallback(
    (params: Record<string, string | number | null>) => {
      if (!syncUrl) return;
      const newParams = new URLSearchParams(searchParams);
      Object.entries(params).forEach(([key, value]) => {
        if (value != null && value !== '' && value !== 0) {
          newParams.set(key, String(value));
        } else {
          newParams.delete(key);
        }
      });
      setSearchParams(newParams, { replace: true });
    },
    [syncUrl, searchParams, setSearchParams]
  );

  const onPageChange = useCallback(
    (newPage: number, newSize: number) => {
      setPage(newPage);
      setPageSize(newSize);
      updateUrl({ page: newPage, size: newSize });
    },
    [updateUrl]
  );

  const onKeywordChange = useCallback(
    (newKeyword: string) => {
      setKeyword(newKeyword);
      setPage(0); // 검색 시 첫 페이지로 이동
      updateUrl({ keyword: newKeyword, page: 0 });
    },
    [updateUrl]
  );

  const onSortingChange = useCallback((newSorting: SortingState) => {
    setSorting(newSorting);
  }, []);

  const onDateRangeChange = useCallback(
    (range: [string | null, string | null]) => {
      setDateRange(range);
      setPage(0);
      updateUrl({ startDate: range[0], endDate: range[1], page: 0 });
    },
    [updateUrl]
  );

  const reset = useCallback(() => {
    setPage(0);
    setPageSize(defaultPageSize);
    setKeyword('');
    setSorting([]);
    setDateRange([null, null]);
    if (syncUrl) {
      setSearchParams({}, { replace: true });
    }
  }, [defaultPageSize, syncUrl, setSearchParams]);

  // 서버 요청용 파라미터
  const queryParams = useMemo(() => {
    const params: Record<string, string | number | undefined> = {
      page,
      size: pageSize,
    };
    if (keyword) params.keyword = keyword;
    if (dateRange[0]) params.startDate = dateRange[0];
    if (dateRange[1]) params.endDate = dateRange[1];
    if (sorting.length > 0) {
      params.sort = `${sorting[0].id},${sorting[0].desc ? 'desc' : 'asc'}`;
    }
    return params;
  }, [page, pageSize, keyword, dateRange, sorting]);

  return {
    page,
    pageSize,
    keyword,
    sorting,
    dateRange,
    onPageChange,
    onKeywordChange,
    onSortingChange,
    onDateRangeChange,
    reset,
    queryParams,
  };
};
```

- [ ] 11.5 빌드 확인

```bash
cd sm-module-web
npx tsc --noEmit
# 기대 출력: 에러 없음
```

- [ ] 11.6 Git 커밋

```bash
git add sm-module-web/src/utils/ sm-module-web/src/hooks/
git commit -m "feat: 유틸리티 함수 및 커스텀 훅 (format, number, useAuth, useTable)"
```

---

## Phase 1 완료 체크리스트

| # | Task | 상태 |
|---|------|------|
| 1 | Backend 프로젝트 초기화 (Gradle, application.yml) | `- [ ]` |
| 2 | 공통 모듈 (BaseEntity, ApiResponse, GlobalExceptionHandler) | `- [ ]` |
| 3 | MariaDB + Flyway 마이그레이션 (V1 인증/권한 테이블) | `- [ ]` |
| 4 | JWT 인증 시스템 (JwtTokenProvider, SecurityConfig, AuthController) | `- [ ]` |
| 5 | Swagger/OpenAPI 설정 | `- [ ]` |
| 6 | Frontend 프로젝트 초기화 (Vite, React, TypeScript) | `- [ ]` |
| 7 | Axios 클라이언트 + JWT 인터셉터 | `- [ ]` |
| 8 | 공용 레이아웃 컴포넌트 (AppHeader, AppSidebar, PageLayout) | `- [ ]` |
| 9 | 공용 테이블/폼 컴포넌트 (DataTable, SearchBar, SearchPopup) | `- [ ]` |
| 10 | 라우팅 + 인증 가드 + 로그인 페이지 | `- [ ]` |
| 11 | 유틸리티 (format, number, useAuth, useTable) | `- [ ]` |

**Phase 1 완료 후 검증 항목:**
1. `sm-module-api`: `./gradlew bootRun` 으로 서버 기동 → Swagger UI 확인
2. `sm-module-web`: `npm run dev` 로 개발 서버 기동 → 로그인 페이지 접근
3. 로그인 API 호출 (ADMIN001 / admin1234!) → JWT 토큰 발급 확인
4. 인증 후 대시보드 접근 → GNB 메뉴 동작 확인
5. 미인증 시 /login 리다이렉트 확인

**다음 Phase 예고:**
- Phase 2: 정보관리 도메인 구현 (사업자관리, 고객관리, 파트 목표, AM 목표)
- Phase 3: 주문관리 도메인 구현 (주문등록, 주문목록, 주문상세)
- Phase 4: 매출관리 도메인 구현
- Phase 5: 매입마감 도메인 구현
- Phase 6: 통계/대시보드 구현
