import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Select, Descriptions, Typography, Spin, message, Divider } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { bizOwnerApi } from '@/api/info.api';
import { useDepartments } from '@/hooks/useDepartments';

export default function BizOwnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['bizOwnerDetail', id],
    queryFn: () => bizOwnerApi.detail(id!),
    enabled: !!id,
  });

  const [deptCd, setDeptCd] = useState<number | null | undefined>(undefined);

  const { departments } = useDepartments();
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ label: d.name, value: d.id })),
    [departments],
  );

  const currentDeptCd = deptCd !== undefined ? deptCd : (detail?.deptCd ?? null);

  const { mutate: saveDept, isPending } = useMutation({
    mutationFn: () => bizOwnerApi.updateDept(id!, currentDeptCd!),
    onSuccess: () => {
      message.success('담당부서가 저장되었습니다');
      queryClient.invalidateQueries({ queryKey: ['bizOwners'] });
      queryClient.invalidateQueries({ queryKey: ['bizOwnerDetail', id] });
      setDeptCd(undefined);
    },
    onError: () => {
      message.error('저장에 실패했습니다');
    },
  });

  if (isLoading) {
    return (
      <PageLayout>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageLayout>
    );
  }

  if (!detail) {
    return (
      <PageLayout>
        <Typography.Text type="danger">데이터를 불러오지 못했습니다.</Typography.Text>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="사업자 상세"
        leading={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/info/biz-owners')}>목록으로</Button>}
      />

      <Descriptions bordered column={2} size="small" style={{ marginBottom: 24 }}>
        <Descriptions.Item label="거래처명" span={2}>{detail.companyName}</Descriptions.Item>
        <Descriptions.Item label="사업자번호">{detail.bizNo || '-'}</Descriptions.Item>
        <Descriptions.Item label="거래처코드">{detail.partnerCd || '-'}</Descriptions.Item>
        <Descriptions.Item label="업태" span={2}>{detail.bizType || '-'}</Descriptions.Item>
        <Descriptions.Item label="종목" span={2}>{detail.bizItem || '-'}</Descriptions.Item>
        <Descriptions.Item label="주소" span={2}>{detail.address || '-'}</Descriptions.Item>
        <Descriptions.Item label="대표자명">{detail.representativeName || '-'}</Descriptions.Item>
        <Descriptions.Item label="대표자 연락처">{(detail as any).representativePhone || '-'}</Descriptions.Item>
        <Descriptions.Item label="대표자 이메일" span={2}>{(detail as any).representativeEmail || '-'}</Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">담당부서 설정</Divider>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Typography.Text strong style={{ minWidth: 80 }}>담당부서</Typography.Text>
        <Select
          style={{ width: 220 }}
          placeholder="담당부서 선택"
          allowClear
          value={currentDeptCd ?? undefined}
          onChange={(v) => setDeptCd(v ?? null)}
          options={departmentOptions}
        />
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={isPending}
          disabled={currentDeptCd == null}
          onClick={() => saveDept()}
        >
          저장
        </Button>
      </div>
    </PageLayout>
  );
}
