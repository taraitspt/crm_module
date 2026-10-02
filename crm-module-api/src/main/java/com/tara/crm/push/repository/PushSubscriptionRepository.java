package com.tara.crm.push.repository;

import com.tara.crm.push.entity.PushSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, Long> {

    Optional<PushSubscription> findByEndpoint(String endpoint);

    List<PushSubscription> findByCompanyCdAndUserId(Integer companyCd, String userId);

    List<PushSubscription> findByCompanyCdAndUserIdIn(Integer companyCd, Collection<String> userIds);

    long countByCompanyCdAndUserId(Integer companyCd, String userId);

    void deleteByEndpoint(String endpoint);
}
