import React, { useState } from 'react';
import { Form, Input, Button, message, Card } from 'antd';
import { login } from '../api';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

interface Props { onLogin: () => void }

const LoginForm: React.FC<Props> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);

  const submit = async (values: any) => {
    console.log('Submitting form with values:', values); // 调试日志
    setLoading(true);
    try {
      const res = await login(values.username, values.password);
      message.success(`登录成功 Tenant: ${res.tenant_id}`);
      onLogin();
    } catch (e:any) {
      console.error('Login error', e);
      message.error(e?.response?.data?.detail || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #f5f7fa, #c3cfe2)'
    }}>
      <Card style={{ width: 400, borderRadius: 8, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>登录到 SIEM 平台</h2>
        <Form 
          onFinish={(values) => {
            console.log('Form onFinish triggered with values:', values); // 调试日志
            submit(values);
          }} 
          style={{ maxWidth: 320, margin: '0 auto' }}
        >
          <Form.Item 
            name="username" 
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input 
              prefix={<UserOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} 
              placeholder="用户名" 
              onChange={(e) => console.log('Username input changed:', e.target.value)} // 调试日志
            />
          </Form.Item>
          <Form.Item 
            name="password" 
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password 
              prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }} />} 
              placeholder="密码" 
              onChange={(e) => console.log('Password input changed:', e.target.value)} // 调试日志
            />
          </Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading} 
            block
            style={{ background: 'linear-gradient(90deg, #4facfe, #00f2fe)', border: 'none' }}
            onClick={() => console.log('Login button clicked')} // 调试日志
          >
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default LoginForm;
