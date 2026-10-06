import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Descriptions,
  Typography,
  Space,
  message,
  Divider,
  Tag,
} from 'antd';
import { SaveOutlined, PhoneOutlined, LockOutlined } from '@ant-design/icons';
import { Switch } from 'antd';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { useAuthStore } from '@/store/authStore';
import { updateMyProfile, changeMyPassword, toggleMfa } from '@/api/auth.api';

const { Text } = Typography;

interface ProfileForm {
  phone: string;
  contactPhone: string;
  email: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}

const MyPage: React.FC = () => {
  const { user, setUser, setTokens } = useAuthStore();
  const [profileForm] = Form.useForm<ProfileForm>();
  const [passwordForm] = Form.useForm<PasswordForm>();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    profileForm.setFieldsValue({
      phone: user?.phone ?? '',
      contactPhone: user?.contactPhone ?? '',
      email: user?.email ?? '',
    });
  }, [user?.phone, user?.contactPhone, user?.email, profileForm]);

  // 시트 #1 0504 — 비밀번호 변경.
  const handlePasswordSubmit = async (values: PasswordForm) => {
    if (values.newPassword !== values.newPasswordConfirm) {
      message.error('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSavingPassword(true);
    try {
      const fresh = await changeMyPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (fresh?.accessToken) setTokens(fresh.accessToken);
      message.success('비밀번호가 변경되었습니다.');
      passwordForm.resetFields();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr?.response?.data?.message || '비밀번호 변경에 실패했습니다.');
    } finally {
      setSavingPassword(false);
    }
  };

  // 시트 #1 0504_1 — 연락처/이메일 갱신. 견적서 등 외부 문서에 사용됨.
  const handleProfileSubmit = async (values: ProfileForm) => {
    setSavingProfile(true);
    try {
      const updated = await updateMyProfile({
        phone: (values.phone ?? '').trim(),
        contactPhone: (values.contactPhone ?? '').trim(),
        email: (values.email ?? '').trim(),
      });
      setUser(updated);
      message.success('연락처/이메일이 저장되었습니다.');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr?.response?.data?.message || '저장에 실패했습니다.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (!user) {
    return (
      <PageLayout>
        <Card>
          <Text>로그인 정보를 확인할 수 없습니다.</Text>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 720 }}>
        <PageHeader title="마이페이지" sub="본인 정보를 확인하고 수정합니다." />

        <Card title="내 정보" size="small">
          <Descriptions
            column={1}
            size="small"
            labelStyle={{ width: 140, color: '#64748b' }}
          >
            <Descriptions.Item label="사원번호">{user.employeeNo}</Descriptions.Item>
            <Descriptions.Item label="이름">{user.name}</Descriptions.Item>
            <Descriptions.Item label="직책">{user.jobTitle || '-'}</Descriptions.Item>
            <Descriptions.Item label="부서">
              {user.departmentName || (user.deptCd != null ? String(user.deptCd) : '-')}
            </Descriptions.Item>
            <Descriptions.Item label="이메일">{user.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="휴대폰">{user.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="연락처">{user.contactPhone || '-'}</Descriptions.Item>
            <Descriptions.Item label="권한">
              <Tag color="blue">{user.role}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 시트 #1 0504_1 — 연락처/이메일은 견적서·거래명세서 등 외부 문서에 표출되므로 사용자가 직접 갱신. */}
        <Card title={<><PhoneOutlined style={{ marginRight: 6 }} />연락처 / 이메일</>} size="small">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            여기서 입력한 연락처와 이메일은 견적서·거래명세서 등 본인이 발행하는 문서에 표시됩니다.
          </Text>
          <Form
            form={profileForm}
            layout="vertical"
            onFinish={handleProfileSubmit}
            requiredMark={false}
          >
            <Form.Item
              name="phone"
              label="휴대폰"
              extra="세금계산서 발행 시 '휴대폰' 항목에 표시됩니다."
              rules={[{ max: 20, message: '20자 이내여야 합니다.' }]}
            >
              <Input placeholder="010-0000-0000" maxLength={20} style={{ maxWidth: 280 }} />
            </Form.Item>
            <Form.Item
              name="contactPhone"
              label="연락처(사무실)"
              extra="세금계산서 발행 시 '연락처' 항목에 표시됩니다."
              rules={[{ max: 20, message: '20자 이내여야 합니다.' }]}
            >
              <Input placeholder="02-0000-0000" maxLength={20} style={{ maxWidth: 280 }} />
            </Form.Item>
            <Form.Item
              name="email"
              label="이메일"
              rules={[
                { type: 'email', message: '올바른 이메일 형식이어야 합니다.' },
                { max: 100, message: '100자 이내여야 합니다.' },
              ]}
            >
              <Input placeholder="name@tara.co.kr" maxLength={100} style={{ maxWidth: 360 }} />
            </Form.Item>
            {/* 직책은 본인이 바꾸지 않는다 — 관리자 > 사용자 관리에서만(2026-10-06). 위 '내 정보'에 보이기만 한다. */}

            <Divider style={{ margin: '12px 0' }} />

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={savingProfile} icon={<SaveOutlined />}>
                저장
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* 시트 #1 0504 — 비밀번호 변경 */}
        <Card title={<><LockOutlined style={{ marginRight: 6 }} />비밀번호 변경</>} size="small">
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handlePasswordSubmit}
            requiredMark={false}
          >
            <Form.Item
              name="currentPassword"
              label="현재 비밀번호"
              rules={[{ required: true, message: '현재 비밀번호를 입력하세요' }]}
            >
              <Input.Password autoComplete="current-password" style={{ maxWidth: 360 }} />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="새 비밀번호"
              rules={[
                { required: true, message: '새 비밀번호를 입력하세요' },
                { min: 8, max: 64, message: '8~64자여야 합니다.' },
              ]}
            >
              <Input.Password autoComplete="new-password" style={{ maxWidth: 360 }} />
            </Form.Item>
            <Form.Item
              name="newPasswordConfirm"
              label="새 비밀번호 확인"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '새 비밀번호를 다시 입력하세요' },
                ({ getFieldValue }) => ({
                  validator(_rule, value) {
                    if (!value || value === getFieldValue('newPassword')) return Promise.resolve();
                    return Promise.reject(new Error('새 비밀번호 확인이 일치하지 않습니다.'));
                  },
                }),
              ]}
            >
              <Input.Password autoComplete="new-password" style={{ maxWidth: 360 }} />
            </Form.Item>

            <Divider style={{ margin: '12px 0' }} />

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={savingPassword} icon={<SaveOutlined />}>
                비밀번호 변경
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* Cost center edit card temporarily hidden.
        <Card title="비용센터 (cc_cd) 설정" size="small">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            주문번호 자동 생성에 사용되는 비용센터 코드입니다.
            {' '}<Text code>GOR + yyMMdd + ccCd(4) + seq(3)</Text>
          </Text>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{ ccCd: user.ccCd ?? '' }}
            requiredMark={false}
          >
            <Form.Item
              name="ccCd"
              label="비용센터 코드"
              extra="4자 영숫자 또는 빈 값(미설정) 만 허용됩니다."
              rules={[
                {
                  validator: (_rule, value) => {
                    const v = (value ?? '').trim();
                    if (v === '') return Promise.resolve();
                    if (/^[A-Za-z0-9]{4}$/.test(v)) return Promise.resolve();
                    return Promise.reject(new Error('4자 영숫자 또는 빈 값으로 입력하세요.'));
                  },
                },
              ]}
            >
              <Input
                placeholder="예: 1234"
                maxLength={4}
                style={{ maxWidth: 240, fontFamily: 'monospace', letterSpacing: 1 }}
              />
            </Form.Item>

            <Divider style={{ margin: '12px 0' }} />

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                icon={<SaveOutlined />}
              >
                저장
              </Button>
            </Form.Item>
          </Form>
        </Card>
        */}

        {/* 시트 #1 — 2차인증 (이메일 OTP) 토글 카드 */}
        <Card title="2차인증 (이메일 OTP)">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
            활성 시 로그인 후 등록된 이메일로 6자리 코드가 발송되며, 코드 입력해야 로그인 완료됩니다.
            이메일 미등록 시에는 안내만 표시되고 코드는 발송되지 않습니다.
          </Text>
          <Space>
            <Switch
              checked={user?.mfaEnabled ?? false}
              onChange={async (checked) => {
                try {
                  const updated = await toggleMfa(checked);
                  setUser(updated);
                  message.success(checked ? '2차인증이 활성화되었습니다.' : '2차인증이 비활성화되었습니다.');
                } catch {
                  message.error('2차인증 변경에 실패했습니다.');
                }
              }}
            />
            <Text strong>{user?.mfaEnabled ? '활성' : '비활성'}</Text>
          </Space>
        </Card>
      </Space>
    </PageLayout>
  );
};

export default MyPage;
