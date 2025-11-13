import React, { useState, useEffect } from 'react';
import { Layout, Tabs, Button } from 'antd';
import { clearAccessToken } from './api';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import AlertList from './components/AlertList';
import TicketList from './components/TicketList';
import Integrations from './pages/Integrations';
import ModeContext, { ModeType } from './modeContext';
import DashboardList from './pages/DashboardList';
import DashboardEditor from './pages/DashboardEditor';
const { Header, Content } = Layout;

const App: React.FC = () => {
  // initialize from localStorage synchronously to avoid flashing the login UI on refresh
  const initialToken = (() => { try { return localStorage.getItem('siem_access_token'); } catch (e) { return null; } })();
  const [loggedIn, setLoggedIn] = useState(!!initialToken);
  const [mode, setMode] = useState<ModeType>('auto');
  const [editingDashboardId, setEditingDashboardId] = useState<string | undefined>(undefined);

  const handleLogout = () => {
    setLoggedIn(false);
    try {
      localStorage.removeItem('siem_access_token');
      localStorage.removeItem('siem_tenant_id');
    } catch (err) {}
    clearAccessToken();
    // user logged out
  };

  useEffect(() => {
    // effect kept for future changes to auth, but initial state is already set synchronously
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
          { key: 'tickets', label: '工单', children: <TicketList /> },
          { key: 'integrations', label: '集成', children: <Integrations /> },
          { key: 'dashboards', label: '仪表盘列表', children: (
            editingDashboardId ? (
              <DashboardEditor dashboardId={editingDashboardId} onBack={() => setEditingDashboardId(undefined)} />
            ) : (
              <DashboardList onEdit={(id?:string) => setEditingDashboardId(id)} />
            )
          ) },
        ]} />
      </Content>
    </Layout>
    </ModeContext.Provider>
  );
};

export default App;
