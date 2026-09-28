import React, { useState } from 'react';
import { Form, Input, Button, Typography, message, Result } from 'antd';
import { UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { resetPassword as resetPasswordApi } from '@/api/auth.api';
import Logo from '@/components/common/Logo';

const { Title, Text } = Typography;

interface FormValues {
  loginId: string;
}

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await resetPasswordApi({ loginId: values.loginId });
      setSent(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr?.response?.data?.message || '임시 비밀번호 발급에 실패했습니다. IT지원팀으로 문의해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32, cursor: 'pointer' }} onClick={() => navigate('/login')}>
          <Logo size={40} showText={true} />
        </div>

        {sent ? (
          <Result
            status="success"
            title="Teams로 임시 비밀번호를 보냈습니다"
            subTitle="Teams 메시지로 받은 임시 비밀번호로 로그인하면, 곧바로 새 비밀번호를 설정하게 됩니다."
            extra={
              <Button type="primary" onClick={() => navigate('/login')}>
                로그인 화면으로
              </Button>
            }
          />
        ) : (
          <>
            <div style={{ marginBottom: 32 }}>
              <Title level={3} style={{ margin: 0, fontWeight: 700 }}>임시 비밀번호 발급</Title>
              <Text type="secondary" style={{ fontSize: 15 }}>
                ERP ID를 입력하면 Teams로 임시 비밀번호를 보내드립니다.
              </Text>
            </div>

            <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
              <Form.Item
                name="loginId"
                label={<Text strong style={{ color: '#64748b', fontSize: 13 }}>ERP ID</Text>}
                rules={[{ required: true, message: 'ERP ID를 입력하세요.' }]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="ERP 로그인 ID"
                  size="large"
                  autoComplete="username"
                  style={{ borderRadius: 10, height: 48 }}
                />
              </Form.Item>

              <Form.Item style={{ marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                  style={{ height: 52, fontSize: 16, fontWeight: 600 }}
                >
                  임시 비밀번호 받기
                </Button>
              </Form.Item>

              <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center' }}>
                Teams를 쓰지 않거나 발급이 계속 실패하면 IT지원팀으로 문의해주세요.
              </Text>

              <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
                <Button
                  type="link"
                  block
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate('/login')}
                >
                  로그인 화면으로
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
