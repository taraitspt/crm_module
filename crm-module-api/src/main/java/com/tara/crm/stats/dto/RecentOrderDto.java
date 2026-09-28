package com.tara.crm.stats.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecentOrderDto {
    private String orderNo;
    private String customerName;
    private long totalAmount;
    private String status;
    private String statusLabel;
    private LocalDateTime createdAt;
}
