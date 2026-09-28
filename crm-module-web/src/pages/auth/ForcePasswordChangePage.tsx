import React, { useState } from 'react';
import { Form, Input, Button, Typography, message, Alert } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { changeMyPassword, logout as logoutApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/authStore';
import Logo from '@/components/common/Logo';

const { Title, Text } = Typography;

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/**
 * 임시 비밀번호로 로그인한 사용자가 새 비밀번호를 설정하는 강제 화면.
 * 설정 완료 전까지 ProtectedRoute 가 다른 화면 접근을 막고 이 페이지로 보낸다.
 */
const ForcePasswordChangePage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const setPasswordResetRequired = useAuthStore((s) => s.setPasswordResetRequired);
  const logoutStore = useAuthStore((s) => s.logout);

  const handleSubmit = async (values: FormValues) => {
    if (values.newPassword !== values.confirm) {
      message.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (values.newPassword.length < 8) {
      message.error('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (values.newPassword === values.currentPassword) {
      message.error('임시 비밀번호와 다른 새 비밀번호를 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      await changeMyPassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setPasswordResetRequired(false);
      message.success('비밀번호가 변경됐습니다.');
      navigate('/');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || '비밀번호 변경에 실패했습니다. 임시 비밀번호를 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await logoutApi(); } catch { /* 무시 */ }
    logoutStore();
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Logo size={40} showText={true} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <Title level={3} style={{ margin: 0, fontWeight: 700 }}>새 비밀번호 설정</Title>
          <Text type="secondary" style={{ fontSize: 15 }}>
            임시 비밀번호로 로그인하셨습니다. 계속하려면 새 비밀번호를 설정해주세요.
          </Text>
        </div>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20, borderRadius: 10 }}
          message="Teams로 받은 임시 비밀번호를 '현재 비밀번호'에 입력하고, 사용할 새 비밀번호를 정해주세요."
        />

        <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="currentPassword"
            label={<Text strong style={{ color: '#64748b', fontSize: 13 }}>현재(임시) 비밀번호</Text>}
            rules={[{ required: true, message: '임시 비밀번호를 입력하세요.' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Teams로 받은 임시 비밀번호"
              size="large"
              style={{ borderRadius: 10, height: 48 }}
            />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label={<Text strong style={{ color: '#64748b', fontSize: 13 }}>새 비밀번호 (8자 이상)</Text>}
            rules={[{ required: true, message: '새 비밀번호를 입력하세요.' }, { min: 8, message: '8자 이상이어야 합니다.' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              placeholder="새 비밀번호"
              size="large"
              style={{ borderRadius: 10, height: 48 }}
            />
          </Form.Item>

          <Form.Item
            name="confirm"
            label={<Text strong style={{ color: '#64748b', fontSize: 13 }}>새 비밀번호 확인</Text>}
            rules={[{ required: true, message: '새 비밀번호를 다시 입력하세요.' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              placeholder="새 비밀번호 확인"
              size="large"
              style={{ borderRadius: 10, height: 48 }}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 8, marginBottom: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{ height: 52, fontSize: 16, fontWeight: 600 }}
            >
              새 비밀번호로 변경
            </Button>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="link" block onClick={handleLogout}>
              다른 계정으로 로그인
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

export default ForcePasswordChangePage;
