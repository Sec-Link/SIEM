import React, { useState, useEffect } from 'react';
import { Layout, Tabs, Button } from 'antd';
import { clearAccessToken } from './api';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import AlertList from './components/AlertList';
import TicketList from './components/TicketList';
import ModeContext, { ModeType } from './modeContext';

const { Header, Content } = Layout;

const App: React.FC = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mode, setMode] = useState<ModeType>('auto');

  const handleLogout = () => {
    setLoggedIn(false);
    try {
      localStorage.removeItem('siem_access_token');
      localStorage.removeItem('siem_tenant_id');
    } catch (err) {}
    clearAccessToken();
    console.log('User logged out'); // 调试日志
  };

  useEffect(() => {
    try {
      const t = localStorage.getItem('siem_access_token');
      if (t) setLoggedIn(true);
    } catch (err) {
      // ignore
    }
  }, []);

  if (!loggedIn) return <LoginForm onLogin={() => setLoggedIn(true)} />;

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', fontSize: 18 }}>
        <span>SIEM</span>
        <Button type="primary" onClick={handleLogout} style={{ background: '#ff4d4f', border: 'none' }}>
          Exit
        </Button>
      </Header>
      <Content style={{ padding: 24 }}>
        <Tabs items={[
          { key: 'dashboard', label: '仪表盘', children: <Dashboard /> },
          { key: 'alerts', label: '告警列表', children: <AlertList /> },
          { key: 'tickets', label: '工单', children: <TicketList /> }
        ]} />
      </Content>
    </Layout>
    </ModeContext.Provider>
  );
};

export default App;
