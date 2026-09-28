# SM 모듈 버그 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sm-module-web` 프론트엔드의 주문목록·외주발주목록·선매출 화면의 버그 6종을 수정한다.

**Architecture:** React 18 + TypeScript + Ant Design + TanStack Query. 모든 수정은 `sm-module-web/src` 내 파일만 변경. 백엔드 변경 없음.

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, TanStack Table

**기준 경로 (BASE):** `C:\Users\201-B1\Desktop\tatatps\tatatps\tatatps\tatatps\tatatps\sm-module-web\src`

---

## 버그 목록

| # | 화면 | 버그 | 파일 | 라인 |
|---|------|------|------|------|
| 1 | 주문목록 | Quick Stats `statusCd` 참조 오류 → 항상 0 | `pages/order/OrderListPage.tsx` | 440-441 |
| 2 | 주문목록 | splitItems `isFirst` 정렬 의존 버그 → 다중작업 그룹핑 오류 | `pages/order/OrderListPage.tsx` | 331 |
| 3 | 주문목록 | 작업처(`wrkNm`) 미출력 | `pages/order/OrderListPage.tsx` | 109 |
| 4 | 외주발주목록 | 발주확정 후 목록에서 사라짐 (필터 미리셋) | `pages/purchase/OutsourcingPoPage.tsx` | 218-224 |
| 5 | 선매출목록 | 수정 모달에 `payType` 필드 없음 | `pages/sales/PreSalesListPage.tsx` | 501-504 |
| 6 | 선매출입력 | 거래처담당자(`partnerContactName`) 필드 없음 | `pages/sales/PreSalesInputPage.tsx` | 50-57, 416-451 |

---

## Task 1: Quick Stats statusCd → status 수정

**파일:**
- Modify: `pages/order/OrderListPage.tsx:440-441`

**원인:** `OrderListItem` 타입(`types/order.ts:56`)에는 `status: string`인데 Quick Stats에서 `o.statusCd`를 참조해서 항상 0을 반환함.

- [ ] **Step 1: 오류 코드 확인**

  `pages/order/OrderListPage.tsx` 440-441라인:
  ```tsx
  { label: '검토 대기', value: data?.data?.content?.filter((o: any) => o.statusCd === 'PENDING').length ?? 0, ... },
  { label: '발송 완료', value: data?.data?.content?.filter((o: any) => o.statusCd === 'SHIP_COMPLETE' || o.statusCd === 'SHIPPED').length ?? 0, ... },
  ```

- [ ] **Step 2: `statusCd` → `status` 수정**

  440-441라인을 아래로 교체:
  ```tsx
  { label: '검토 대기', value: data?.data?.content?.filter((o: any) => o.status === 'PENDING').length ?? 0, unit: '건', color: token.colorPrimary },
  { label: '발송 완료', value: data?.data?.content?.filter((o: any) => o.status === 'SHIP_COMPLETE' || o.status === 'SHIPPED').length ?? 0, unit: '건', color: token.colorSuccess },
  ```

- [ ] **Step 3: 브라우저에서 주문목록 열어 Quick Stats 숫자 확인**

  - 조회 후 '검토 대기', '발송 완료' 숫자가 0이 아닌 실제 건수로 표시되면 OK.

- [ ] **Step 4: 커밋**

  ```bash
  git add src/pages/order/OrderListPage.tsx
  git commit -m "fix: Quick Stats statusCd → status 참조 오류 수정"
  ```

---

## Task 2: splitItems isFirst 정렬 의존 버그 수정

**파일:**
- Modify: `pages/order/OrderListPage.tsx:331`

**원인:** 현재 코드는 `rawContent[i-1].orderNo !== item.orderNo` 비교로 isFirst를 판단해서 **서버 응답이 orderNo 기준으로 연속 정렬되어야만** 정상 동작함. 비정렬 시 가상 헤더가 중복 삽입되어 다중작업 주문이 깨짐.

- [ ] **Step 1: 현재 splitItems 로직 확인 (329-355라인)**

  ```tsx
  const isFirst = i === 0 || rawContent[i - 1].orderNo !== item.orderNo;  // ← 버그
  ```

- [ ] **Step 2: isFirst 계산 방식 변경**

  `countMap`에서 이미 전체 등장 횟수를 알고 있으므로, `seenSet`(이미 처리한 orderNo 집합)을 사용해 정렬 독립적으로 계산:

  331라인 **바로 앞에** `const seenSet = new Set<string>();` 선언 추가 (327라인 result 선언 직후):
  ```tsx
  const result: SplitWorkItem[] = [];
  const seenSet = new Set<string>();          // ← 추가
  const workIndexTracker = new Map<string, number>();
  ```

  그리고 331라인을 변경:
  ```tsx
  // 변경 전
  const isFirst = i === 0 || rawContent[i - 1].orderNo !== item.orderNo;
  
  // 변경 후
  const isFirst = !seenSet.has(item.orderNo);
  seenSet.add(item.orderNo);
  ```

  최종 329-355라인 전체 모습:
  ```tsx
  const result: SplitWorkItem[] = [];
  const seenSet = new Set<string>();
  const workIndexTracker = new Map<string, number>();
  rawContent.forEach((item) => {
    const total = countMap.get(item.orderNo) ?? 1;
    const isFirst = !seenSet.has(item.orderNo);
    seenSet.add(item.orderNo);
    if (isFirst && total > 1) {
      result.push({
        ...item,
        splitWorkName: '',
        workIndex: -1,
        isFirstInGroup: true,
        isVirtualHeader: true,
        totalInGroup: total,
      });
    }
    const currentIndex = workIndexTracker.get(item.orderNo) ?? 0;
    workIndexTracker.set(item.orderNo, currentIndex + 1);
    result.push({
      ...item,
      splitWorkName: item.workName || '',
      workIndex: currentIndex,
      isFirstInGroup: total === 1,
      isVirtualHeader: false,
      totalInGroup: total,
    });
  });
  ```

  > `i` 파라미터도 더 이상 사용하지 않으므로 `rawContent.forEach((item, i) =>` → `rawContent.forEach((item) =>`로 변경.

- [ ] **Step 3: 주문목록에서 다중작업 주문 확인**

  - 주문번호가 같은 항목이 2건 이상일 때 가상 헤더 1개 + 서브행들로 정상 표시되면 OK.

- [ ] **Step 4: 커밋**

  ```bash
  git add src/pages/order/OrderListPage.tsx
  git commit -m "fix: splitItems isFirst 정렬 의존 버그 수정 (seenSet 방식으로 변경)"
  ```

---

## Task 3: 작업처(wrkNm) 미출력 수정

**파일:**
- Modify: `pages/order/OrderListPage.tsx:109-114`

**원인:** 세부품목 열 렌더링 시 `record.isFirstInGroup && label` 조건이 있어, 다중작업 주문의 서브행(`isFirstInGroup: false`)에서는 작업처 태그가 아예 표시 안 됨. 또한 단일 작업 주문도 `wrkNm`이 null이고 `workType`이 ERP 코드값(예: `'G0100'`)이면 `WORK_TYPE` 상수 매핑 실패로 빈 문자열.

- [ ] **Step 1: 현재 렌더링 코드 확인 (109-114라인)**

  ```tsx
  const raw = record.wrkNm || WORK_TYPE[record.workType as keyof typeof WORK_TYPE] || record.workType || '';
  const label = raw && raw !== '-' ? raw : '';
  return (
    <div ...>
      {record.isFirstInGroup && label && (   // ← isFirstInGroup이 false면 태그 안 나옴
        <Tag ...>{label}</Tag>
      )}
  ```

- [ ] **Step 2: 서브행도 작업처 표시하도록 수정**

  `isFirstInGroup` 조건 제거. 가상 헤더(`isVirtualHeader`)만 제외:

  ```tsx
  const raw = record.wrkNm || WORK_TYPE[record.workType as keyof typeof WORK_TYPE] || record.workType || '';
  const label = raw && raw !== '-' ? raw : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {!record.isVirtualHeader && label && (
        <Tag bordered={false} style={{ borderRadius: 6, background: '#f1f5f9', color: '#475569', margin: 0, flexShrink: 0 }}>{label}</Tag>
      )}
      {record.isVirtualHeader && (
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#cbd5e1', flexShrink: 0, marginLeft: 4 }} />
      )}
      <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{info.getValue() || '-'}</Text>
  ```

- [ ] **Step 3: WORK_TYPE 상수 확인**

  파일 상단에서 `WORK_TYPE` 상수가 정의된 위치를 찾아 ERP 코드(`G0100`, `G0200` 등)에 대한 매핑이 있는지 확인. 없으면 `wrkNm` 우선 표시하므로 `wrkNm`이 서버에서 내려오는지 확인.

- [ ] **Step 4: 커밋**

  ```bash
  git add src/pages/order/OrderListPage.tsx
  git commit -m "fix: 작업처 태그 isFirstInGroup 조건 제거 - 모든 행에 표시"
  ```

---

## Task 4: 외주발주 확정 후 필터 자동 리셋

**파일:**
- Modify: `pages/purchase/OutsourcingPoPage.tsx:218-224`

**원인:** 발주확정 시 항목 상태가 `PENDING` → `UNSETTLED`로 바뀌는데, 현재 `status` 필터가 `'PENDING'`으로 설정되어 있으면 새로고침 후 해당 항목이 필터에 걸려 목록에서 사라짐. 사용자는 "확정했는데 사라졌다"고 인식.

- [ ] **Step 1: handleBulkAction의 onOk 콜백 확인 (215-228라인)**

  ```tsx
  onOk: async () => {
    try {
      await Promise.all([
        ...confirmable.map(r => outsourcingPoApi.changeStatus(r.poNo, 'UNSETTLED')),
        ...cancellable.map(r => outsourcingPoApi.changeStatus(r.poNo, 'PENDING')),
      ]);
      message.success('처리 완료되었습니다.');
      setSelectedRowKeys([]);
      setSelectedRows([]);
      queryClient.invalidateQueries({ queryKey: ['outsourcing-po'] });
    } catch {
      message.error('처리에 실패했습니다.');
    }
  },
  ```

- [ ] **Step 2: 확정 성공 시 status 필터 초기화 추가**

  `queryClient.invalidateQueries` 호출 바로 위에 `setStatus('')` 추가:

  ```tsx
  onOk: async () => {
    try {
      await Promise.all([
        ...confirmable.map(r => outsourcingPoApi.changeStatus(r.poNo, 'UNSETTLED')),
        ...cancellable.map(r => outsourcingPoApi.changeStatus(r.poNo, 'PENDING')),
      ]);
      message.success('처리 완료되었습니다.');
      setSelectedRowKeys([]);
      setSelectedRows([]);
      setStatus('');                                                        // ← 추가
      queryClient.invalidateQueries({ queryKey: ['outsourcing-po'] });
    } catch {
      message.error('처리에 실패했습니다.');
    }
  },
  ```

- [ ] **Step 3: 동작 확인**

  1. 외주발주목록에서 상태 필터를 `PENDING`으로 설정 후 조회
  2. 항목 선택 후 '발주확정/취소' 클릭 → 확인
  3. 처리 완료 후 필터가 '전체'로 리셋되고 확정된 항목(`UNSETTLED` 상태)이 목록에 보이면 OK.

- [ ] **Step 4: 커밋**

  ```bash
  git add src/pages/purchase/OutsourcingPoPage.tsx
  git commit -m "fix: 외주발주 확정 후 status 필터 자동 초기화"
  ```

---

## Task 5: 선매출목록 수정 모달에 payType 필드 추가

**파일:**
- Modify: `pages/sales/PreSalesListPage.tsx:501-504`

**원인:** `PreSalesListPage`의 수정 모달에 `payType`(결제방식) 필드가 없음. `PreSalesCreatePayload` 타입에도 선언이 안 되어 있어 수정 시 결제방식이 null로 전송됨.

- [ ] **Step 1: PreSalesListPage 타입 정의 확인**

  파일 상단(27-61라인)에서 `PreSalesCreatePayload`에 `payType` 필드가 있는지 확인. 없으면 추가:

  ```ts
  interface PreSalesCreatePayload {
    salesTitle: string;
    partnerNm: string;
    partnerCd?: string;
    totalAmt: number;
    taxTypeCd: string;
    payType: string;    // ← 추가
    note: string;
  }
  ```

- [ ] **Step 2: 수정 모달 폼에 payType 필드 추가 (501-504라인 이후)**

  `taxTypeCd` Form.Item 다음, `note` Form.Item 이전에 삽입:

  ```tsx
  <Form.Item name="taxTypeCd" label="세무구분" rules={[{ required: true, message: '세무구분을 선택하세요.' }]}>
    <SelectFilter options={TAX_TYPE_OPTIONS} onChange={(v) => form.setFieldValue('taxTypeCd', v)}
      value={form.getFieldValue('taxTypeCd')} placeholder="세무구분 선택" width="100%" showAll={false} />
  </Form.Item>

  {/* ↓ 추가 */}
  <Form.Item name="payType" label="결제방식" rules={[{ required: true, message: '결제방식을 선택하세요.' }]}>
    <Select placeholder="결제방식 선택" style={{ height: 40, borderRadius: 10 }}>
      <Select.Option value="CARD">카드</Select.Option>
      <Select.Option value="CASH">현금</Select.Option>
      <Select.Option value="TRANSFER">계좌이체</Select.Option>
      <Select.Option value="OTHER">기타</Select.Option>
    </Select>
  </Form.Item>

  <Form.Item name="note" label="비고">
  ```

  > `Select`를 사용하므로 import에 `Select`가 있는지 확인. 없으면 `import { ..., Select } from 'antd';`에 추가.

- [ ] **Step 3: 수정 시 폼 초기값에 payType 포함 확인**

  `handleEditClick` 또는 `form.setFieldsValue` 호출 코드에서 `payType: item.payType` 이 포함되어 있는지 확인. 없으면 추가.

- [ ] **Step 4: 브라우저 확인**

  선매출 목록에서 항목 수정 클릭 → 모달에 '결제방식' 드롭다운이 표시되면 OK.

- [ ] **Step 5: 커밋**

  ```bash
  git add src/pages/sales/PreSalesListPage.tsx
  git commit -m "fix: 선매출 수정 모달에 payType(결제방식) 필드 추가"
  ```

---

## Task 6: 선매출입력 거래처담당자 필드 추가

**파일:**
- Modify: `pages/sales/PreSalesInputPage.tsx:50-57` (타입)
- Modify: `pages/sales/PreSalesInputPage.tsx:416-451` (모달 폼)

**원인:** `PreSalesCreatePayload` 타입에 거래처담당자 필드가 없고, 등록 모달 폼에도 해당 UI가 없음.

- [ ] **Step 1: 타입에 partnerContactName 필드 추가 (50-57라인)**

  ```ts
  interface PreSalesCreatePayload {
    salesTitle: string;
    partnerNm: string;
    totalAmt: number;
    taxTypeCd: string;
    payType: string;
    partnerContactName?: string;    // ← 추가
    note: string;
  }
  ```

- [ ] **Step 2: 모달 폼에 거래처담당자 Input 추가 (partnerNm 필드 다음)**

  `partnerCd` hidden 필드 바로 아래, `totalAmt` 필드 위에 삽입:

  ```tsx
  <Form.Item name="partnerCd" hidden><Input /></Form.Item>

  {/* ↓ 추가 */}
  <Form.Item name="partnerContactName" label="거래처담당자">
    <Input placeholder="거래처 담당자 이름 입력" style={{ height: 40, borderRadius: 10 }} />
  </Form.Item>

  <Form.Item name="totalAmt" label="금액" ...>
  ```

- [ ] **Step 3: 등록/수정 API 페이로드에 포함 확인**

  `handleSubmit` 또는 `createMutation`/`updateMutation` 호출 부분에서 `form.getFieldsValue()`가 `partnerContactName`을 포함하는지 확인. `getFieldsValue()`를 전체로 쓰면 자동 포함됨.

- [ ] **Step 4: 브라우저 확인**

  선매출입력 → 등록 모달에서 '거래처담당자' 입력 필드가 표시되면 OK.

- [ ] **Step 5: 커밋**

  ```bash
  git add src/pages/sales/PreSalesInputPage.tsx
  git commit -m "feat: 선매출입력 모달에 거래처담당자 필드 추가"
  ```

---

## Self-Review

### Spec 커버리지 체크
- [x] Bug 1 (Quick Stats statusCd) → Task 1
- [x] Bug 2 (splitItems isFirst) → Task 2
- [x] Bug 3 (wrkNm 미출력) → Task 3
- [x] Bug 4 (외주발주 필터 미리셋) → Task 4
- [x] Bug 5 (payType 필드 누락) → Task 5
- [x] Bug 6 (거래처담당자 필드) → Task 6

### 주의사항
- Task 2와 3은 같은 파일(`OrderListPage.tsx`) 수정이므로 순서대로 실행. 충돌 없음 (수정 라인 다름).
- Task 5에서 `Select` 컴포넌트 import 여부 확인 필수.
- Task 6의 `partnerContactName`은 백엔드 API 스펙과 필드명이 일치해야 함. 서버가 다른 이름을 쓰면 맞춰야 함.
