import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Avatar } from 'antd';
import {
  DashboardOutlined,
  BellOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  AppstoreOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { clearAccessToken } from './api';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import AlertList from './components/AlertList';
import TicketList from './components/TicketList';
import Integrations from './pages/Integrations';
import ModeContext, { ModeType } from './modeContext';
import DashboardList from './pages/DashboardList';
import DashboardEditor from './pages/DashboardEditor';
import DataSources from './pages/DataSources';
import Orchestrator from './pages/Orchestrator';
const { Header, Content, Sider } = Layout;

// small, minimal SVG icon for database/datasource menu item
const DatabaseSvg: React.FC<{style?: React.CSSProperties}> = ({ style }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" style={style} xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor">
    <ellipse cx="12" cy="5" rx="8" ry="3" strokeWidth="1.6" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" strokeWidth="1.6" />
    <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" strokeWidth="1.6" />
  </svg>
);

const App: React.FC = () => {
  // initialize from localStorage synchronously to avoid flashing the login UI on refresh
  const initialToken = (() => { try { return localStorage.getItem('siem_access_token'); } catch (e) { return null; } })();
  const [loggedIn, setLoggedIn] = useState(!!initialToken);
  const [mode, setMode] = useState<ModeType>('auto');
  const [editingDashboardId, setEditingDashboardId] = useState<string | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<string>('dashboard');
  const [openKeys, setOpenKeys] = useState<string[]>(['dashboardGroup']);
  const [username, setUsername] = useState<string | null>(() => {
    try { return localStorage.getItem('siem_username'); } catch (e) { return null; }
  });

  const handleLogout = () => {
    setLoggedIn(false);
    try {
      localStorage.removeItem('siem_access_token');
      localStorage.removeItem('siem_tenant_id');
      localStorage.removeItem('siem_username');
    } catch (err) {}
    clearAccessToken();
    setUsername(null);
    // user logged out
  };

  useEffect(() => {
    // effect kept for future changes to auth, but initial state is already set synchronously
    try {
      const t = localStorage.getItem('siem_access_token');
      if (t) setLoggedIn(true);
      const u = localStorage.getItem('siem_username');
      if (u) setUsername(u);
    } catch (err) {
      // ignore
    }
  }, []);

  // when login state changes, make sure username is refreshed from storage
  useEffect(() => {
    try {
      if (loggedIn) {
        const u = localStorage.getItem('siem_username');
        if (u) setUsername(u);
      }
    } catch (err) {}
  }, [loggedIn]);

  const renderContent = (key: string) => {
    switch (key) {
      case 'dashboard': return <Dashboard />;
      case 'alerts': return <AlertList />;
      case 'tickets': return <TicketList />;
      case 'integrations': return <Integrations />;
      case 'dashboards': return editingDashboardId ? (
        <DashboardEditor dashboardId={editingDashboardId} onBack={() => setEditingDashboardId(undefined)} />
      ) : (
        <DashboardList onEdit={(id?:string) => { setEditingDashboardId(id); setSelectedKey('dashboards'); }} />
      );
      case 'datasources': return <DataSources />;
      case 'orchestrator': return <Orchestrator />;
      default: return <Dashboard />;
    }
  };

  // keep sensible parent open when a child is selected
  useEffect(() => {
    if (['dashboard', 'alerts'].includes(selectedKey)) setOpenKeys(['dashboardGroup']);
    else if (['tickets'].includes(selectedKey)) setOpenKeys(['ticketGroup']);
    else if (['integrations', 'dashboards', 'datasources', 'orchestrator'].includes(selectedKey)) setOpenKeys(['settingsGroup']);
  }, [selectedKey]);

  if (!loggedIn) return <LoginForm onLogin={() => setLoggedIn(true)} />;

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
    <Layout style={{ minHeight: '100vh' }}>
      <style>{` 
        /* Pale column background with darker text for contrast */
        .siem-menu-pale .ant-menu-item, .siem-menu-pale .ant-menu-submenu-title {
          color: #0f3b66;
        }
        .siem-menu-pale .ant-menu-item .anticon, .siem-menu-pale .ant-menu-submenu-title .anticon {
          color: #0f3b66;
        }
        /* subtle hover/active backgrounds to keep readability */
        .siem-menu-pale .ant-menu-item:hover, .siem-menu-pale .ant-menu-item-active, .siem-menu-pale .ant-menu-item-selected, .siem-menu-pale .ant-menu-submenu-title:hover {
          background: rgba(15,59,102,0.06) !important;
          color: #0f3b66 !important;
        }
        .siem-menu-pale .ant-menu-item-selected {
          background: rgba(15,59,102,0.10) !important;
        }
      `}</style>
      <Sider width={220} style={{ background: '#e6f3ff' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 16px', fontWeight: 700 }}>
          <div style={{ width: 48, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1f6fd1', borderRadius: 6, marginRight: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: 0 }} xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#fff">
              <circle cx="12" cy="12" r="8" strokeWidth="1.2" />
              <path d="M8 12h8" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontWeight: 900, letterSpacing: 0.6, fontSize: 22, color: '#0f3b66' }}>SIEM</span>
        </div>
        <Menu
          mode="inline"
          className="siem-menu-pale"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          onClick={({ key }) => setSelectedKey(String(key))}
          style={{ borderRight: 'none', background: 'transparent' }}
        >
          <Menu.SubMenu key="dashboardGroup" icon={<DashboardOutlined />} title="Dashboard">
            <Menu.Item key="dashboard" icon={<DashboardOutlined />}>仪表盘</Menu.Item>
            <Menu.Item key="alerts" icon={<BellOutlined />}>告警列表</Menu.Item>
          </Menu.SubMenu>

          <Menu.SubMenu key="ticketGroup" icon={<TeamOutlined />} title="Ticket">
            <Menu.Item key="tickets" icon={<UnorderedListOutlined />}>工单</Menu.Item>
          </Menu.SubMenu>

          <Menu.SubMenu key="settingsGroup" icon={<SettingOutlined />} title="Settings">
            <Menu.Item key="integrations" icon={<AppstoreOutlined />}>集成</Menu.Item>
            <Menu.Item key="dashboards" icon={<DashboardOutlined />}>仪表盘列表</Menu.Item>
            <Menu.Item key="datasources" icon={<DatabaseSvg style={{ marginRight: 8 }} />}>数据源</Menu.Item>
            <Menu.Item key="orchestrator" icon={<SettingOutlined />}>编排器</Menu.Item>
          </Menu.SubMenu>
        </Menu>
      </Sider>

      <Layout>
        <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e6f3ff', padding: '0 24px', borderBottom: 'none', color: '#0f3b66' }}>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar style={{ background: '#1f6fd1', color: '#fff', fontWeight: 700 }}>
              {(username && username[0]) ? String(username[0]).toUpperCase() : 'U'}
            </Avatar>
            <div style={{ color: '#0f3b66', fontWeight: 600 }}>{username || 'User'}</div>
            <Button type="primary" onClick={handleLogout} style={{ background: '#ff4d4f', border: 'none' }}>
              Exit
            </Button>
          </div>
        </Header>
        <Content style={{ padding: 24 }}>
          <div onClick={(e:any) => {
            const key = e?.key || (e?.target && e.target.getAttribute && e.target.getAttribute('data-key'));
            if (key) setSelectedKey(String(key));
          }}>
            {renderContent(selectedKey)}
          </div>
        </Content>
      </Layout>
    </Layout>
    </ModeContext.Provider>
  );
};

export default App;
