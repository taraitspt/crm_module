import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox, Typography, message, Row, Col } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { login as loginApi, getMe, verifyMfa as verifyMfaApi } from '@/api/auth.api';
import type { TokenResponse } from '@/types/auth';
import Logo from '@/components/common/Logo';
import { T } from '@/theme/designTokens';

const { Title, Text } = Typography;

interface LoginFormValues {
  id: string;
  password: string;
  remember: boolean;
}

const REMEMBER_KEY = 'sm-remember-login-id';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState(false);
  const { setTokens, setUser, setPasswordResetRequired } = useAuthStore();

  // 시트 #1 — 2차인증 step. mfaChallenge 가 있으면 OTP 입력 화면으로 전환.
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const completeLogin = async (result: TokenResponse) => {
    setTokens(result.accessToken);
    const userInfo = await getMe();
    setUser(userInfo);
    // 임시 비밀번호로 로그인한 경우 — 새 비밀번호 설정 화면으로 강제 이동.
    if (result.passwordResetRequired) {
      setPasswordResetRequired(true);
      navigate('/force-password-change');
    } else {
      setPasswordResetRequired(false);
      // 보호 라우트가 보낸 원래 목적지(/m 모바일 앱 등)가 있으면 거기로, 없으면 홈.
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    }
  };

  const handleMfaVerify = async () => {
    if (!mfaChallenge || mfaCode.length !== 6) {
      message.error('6자리 코드를 입력하세요.');
      return;
    }
    setMfaLoading(true);
    try {
      const r = await verifyMfaApi({ challenge: mfaChallenge, code: mfaCode });
      await completeLogin(r);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; errorCode?: string } } };
      message.error(e?.response?.data?.message || '인증 코드가 올바르지 않습니다.');
      // 5회 초과·만료(AUTH_012) — challenge 가 폐기됐으니 로그인 단계로 되돌린다.
      if (e?.response?.data?.errorCode === 'AUTH_012') { setMfaChallenge(null); setMfaCode(''); }
    } finally {
      setMfaLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      form.setFieldsValue({ id: saved, remember: true });
    }
  }, [form]);

  const handleSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const result = await loginApi({
        id: values.id,
        password: values.password,
      });

      if (values.remember) {
        localStorage.setItem(REMEMBER_KEY, values.id);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      // 시트 #1 MFA — mfaRequired=true 면 OTP step 으로 전환.
      if (result.mfaRequired && result.mfaChallenge) {
        setMfaChallenge(result.mfaChallenge);
        setMfaCode('');
        return;
      }

      await completeLogin(result);
    } catch (err: unknown) {
      // API 에러 메시지가 있으면 해당 메시지를 표시
      const axiosErr = err as { response?: { data?: { message?: string; errorCode?: string } } };
      const errorMsg = axiosErr?.response?.data?.message
        || '로그인에 실패했습니다. 아이디와 비밀번호를 확인하세요.';
      // 첫 로그인 대기 계정(AUTH_010) — 공통 초기 비밀번호가 없어졌으니 1회용 비밀번호 발급 화면으로 바로 안내한다.
      if (axiosErr?.response?.data?.errorCode === 'AUTH_010') {
        message.warning(errorMsg, 6);
        navigate('/forgot-password', { state: { loginId: values.id, firstLogin: true } });
        return;
      }
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex' }}>
      <Row style={{ width: '100%' }}>
        {/* 좌측: 브랜드 패널 — 사실 기반 카피만, 마케팅 톤·가짜 통계 제거.
            인라인 display:flex 를 Col 에 두면 AntD 의 `.ant-col-xs-0{display:none}` 규칙을
            덮어써 모바일(xs=0)에서도 패널이 노출된다. flex 정렬은 내부 wrapper div 로 이동. */}
        <Col xs={0} lg={12} style={{
          background: `linear-gradient(160deg, #E9F4F5 0%, #FFFFFF 100%)`,
          padding: '0 80px',
          color: T.t1,
          borderRight: `1px solid ${T.border1}`,
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            minHeight: '100vh', paddingBlock: 64,
          }}>
            <Logo size={40} tone="light" />

            <div>
              <Title style={{ color: T.navy, margin: 0, fontWeight: 700, fontSize: 40, lineHeight: 1.15 }}>
                TARA TPS<br /><span style={{ color: T.primary }}>CRM</span>
              </Title>
              <Text style={{ color: T.t3, fontSize: 16, marginTop: 16, display: 'block' }}>
                영업관리 시스템
              </Text>
            </div>

            <Text style={{ color: T.t4, fontSize: 12 }}>
              © 2026 TARA TPS
            </Text>
          </div>
        </Col>

        {/* 우측: 로그인 폼 섹션 */}
        <Col xs={24} lg={12} style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: '40px'
        }}>
          <div style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ marginBottom: 40 }}>
              <Title level={2} style={{ fontWeight: 700, margin: 0 }}>
                {mfaChallenge ? '2차인증' : '로그인'}
              </Title>
              <Text type="secondary" style={{ fontSize: 15 }}>
                {mfaChallenge ? '등록된 이메일로 발송된 6자리 코드를 입력하세요.' : 'TARA TPS 계정 정보를 입력하세요.'}
              </Text>
              {!mfaChallenge && (
                <>
                  <Text type="secondary" style={{ fontSize: 13, color: '#94a3b8', display: 'block', marginTop: 4 }}>
                    ERP와 같은 ID로 로그인합니다. 처음 로그인하거나 비밀번호를 잊었다면 [비밀번호 분실]에서 Teams로 1회용 비밀번호를 받아 시작하세요.
                  </Text>
                </>
              )}
            </div>

            {mfaChallenge ? (
              <Form layout="vertical" requiredMark={false} onFinish={handleMfaVerify}>
                <Form.Item label={<Text strong style={{ color: '#64748b', fontSize: 13 }}>인증 코드 (6자리)</Text>}>
                  <Input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    size="large"
                    maxLength={6}
                    style={{ borderRadius: 10, height: 48, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
                    autoFocus
                  />
                </Form.Item>
                <Form.Item style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={mfaLoading}
                    block
                    size="large"
                    style={{ height: 52, fontSize: 16, fontWeight: 600 }}
                  >
                    인증
                  </Button>
                </Form.Item>
                <Form.Item>
                  <Button type="link" block onClick={() => { setMfaChallenge(null); setMfaCode(''); }}>
                    로그인 화면으로
                  </Button>
                </Form.Item>
              </Form>
            ) : (
            <Form
              form={form}
              onFinish={handleSubmit}
              layout="vertical"
              autoComplete="off"
              initialValues={{ remember: false }}
              requiredMark={false}
            >
              <Form.Item
                name="id"
                label={<Text strong style={{ color: '#64748b', fontSize: 13 }}>아이디</Text>}
                rules={[{ required: true, message: '아이디를 입력하세요.' }]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="아이디를 입력하세요"
                  size="large"
                  style={{ borderRadius: 10, height: 48 }}
                />
              </Form.Item>

              <Form.Item
                name="password"
                label={<Text strong style={{ color: '#64748b', fontSize: 13 }}>비밀번호</Text>}
                rules={[{ required: true, message: '비밀번호를 입력하세요.' }]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                  placeholder="비밀번호를 입력하세요"
                  size="large"
                  style={{ borderRadius: 10, height: 48 }}
                />
              </Form.Item>

              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Form.Item name="remember" valuePropName="checked" noStyle>
                    <Checkbox style={{ color: '#64748b' }}>아이디 기억하기</Checkbox>
                  </Form.Item>
                  <Button type="link" size="small" style={{ padding: 0 }}
                    onClick={() => navigate('/forgot-password')}
                  >
                    비밀번호 분실
                  </Button>
                </div>
              </Form.Item>

              <Form.Item style={{ marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                  style={{
                    height: 52,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  로그인
                </Button>
              </Form.Item>
            </Form>
            )}

            {/* 모바일(좌측 패널 숨김) 전용 footer — 데스크탑에선 좌측 패널의 footer 와 중복되어 숨김. */}
            <div style={{ textAlign: 'center', marginTop: 40, display: 'block' }} className="login-mobile-footer">
              <Text type="secondary" style={{ fontSize: 13 }}>
                © 2026 TARA TPS. All rights reserved.
              </Text>
            </div>
            <style>{`
              @media (min-width: 992px) {
                .login-mobile-footer { display: none !important; }
              }
            `}</style>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default LoginPage;
