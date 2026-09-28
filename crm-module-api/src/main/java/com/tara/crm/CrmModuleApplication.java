package com.tara.crm;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableJpaAuditing
@EnableScheduling
public class CrmModuleApplication {

    public static void main(String[] args) {
        // 운영 EC2 (Amazon Linux) 시스템 timezone 이 UTC 라 JVM 도 UTC 로 동작 → LocalDateTime.now()
        // 가 UTC 시각 반환. BaseEntity audit (createdAt/updatedAt) + PoHistory.changedAt 등 모든
        // 시각 데이터가 한국 시간보다 9시간 빠르게 저장/표시되던 문제 해소.
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));
        SpringApplication.run(CrmModuleApplication.class, args);
    }
}
