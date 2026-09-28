package com.tara.crm.integration.erp.repository;

import com.tara.crm.integration.erp.entity.ErpItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ErpItemJpaRepository extends JpaRepository<ErpItem, Long> {

    Optional<ErpItem> findByItemCode(String itemCode);

    List<ErpItem> findTop20ByItemNameContainingAndUseYnOrderByItemName(String keyword, String useYn);
}
