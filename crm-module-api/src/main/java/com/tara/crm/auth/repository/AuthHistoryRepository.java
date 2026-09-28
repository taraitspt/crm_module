package com.tara.crm.auth.repository;

import com.tara.crm.auth.entity.AuthHistory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthHistoryRepository extends JpaRepository<AuthHistory, Long> {
}
