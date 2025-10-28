import React, { useEffect, useState, useContext } from 'react';
import { Pie, Line } from '@ant-design/charts';
import { Column } from '@ant-design/plots';
import { Card, Statistic, Row, Col, Space, Select, Button, Modal, Form, Input, Switch, message, Spin } from 'antd';
import { fetchDashboard, getESConfig, setESConfig, getWebhookConfig, setWebhookConfig } from '../api';
import ModeContext from '../modeContext';
import { DashboardData } from '../types';

const { Option } = Select;

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  // keep last successful data to avoid UI blanking during reloads
  const [displayData, setDisplayData] = useState<DashboardData | null>(null);
  const { mode, setMode } = useContext(ModeContext);
  const modeRef = React.useRef<typeof mode>(mode);
  const failuresRef = React.useRef<number>(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const CACHE_KEY = 'siem_dashboard_cache_v1';
  const POLL_INTERVAL_MS = 30 * 1000; // poll every 30s for less frequent refreshes
  const [esModalVisible, setEsModalVisible] = useState(false);
  const [webhookModalVisible, setWebhookModalVisible] = useState(false);
  const [esConfig, setEsConfigState] = useState<any>(null);
  const [webhookConfig, setWebhookConfigState] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async (m?: 'auto'|'es'|'mock') => {
    const useMode = m ?? modeRef.current;
    const isBackground = !!displayData;
    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      let res = await fetchDashboard(useMode);
      setData(res);
      // only update the displayData when we successfully fetched something
      if (res) {
        setDisplayData(res);
        // cache for faster next-loads
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: res }));
        } catch (err) {
          // ignore storage errors
        }
        failuresRef.current = 0;
      }
    } catch (e:any) {
      console.error('Dashboard load error', e);
      // light failure backoff: increment failures and skip next few polls if failing repeatedly
      failuresRef.current = (failuresRef.current || 0) + 1;
      const failCount = failuresRef.current;
      // only show a visible error when we have no cached data (initial load)
      if (!displayData && failCount <= 1) {
        message.error('Failed to load dashboard data');
      }
      // if we exceed 5 failures, schedule a delayed retry
      if (failCount > 5) {
        setTimeout(() => load(modeRef.current), Math.min(60000, 2000 * Math.pow(2, failCount - 5)));
      }
    } finally {
      if (isBackground) setRefreshing(false);
      else setLoading(false);
    }
  };

  const loadConfigs = async () => {
    try {
      const es = await getESConfig();
      setEsConfigState(es);
    } catch (e) {
      // ignore
    }
    try {
      const wh = await getWebhookConfig();
      setWebhookConfigState(wh);
    } catch (e) {
      // ignore
    }
  }

  // small hook to animate numbers smoothly between updates
  function useAnimatedNumber(target: number, duration = 500) {
    const [value, setValue] = React.useState(target);
    const rafRef = React.useRef<number | null>(null);
    React.useEffect(() => {
      const start = value;
      const change = target - start;
      if (change === 0) return;
      const startTime = performance.now();
      function animate(now: number) {
        const elapsed = now - startTime;
        if (elapsed >= duration) {
          setValue(target);
          return;
        }
        setValue(start + change * (elapsed / duration));
        rafRef.current = requestAnimationFrame(animate);
      }
      rafRef.current = requestAnimationFrame(animate);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current!);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target]);
    return Math.round(value);
  }

  useEffect(() => {
    // on mount only: read cache and perform initial loads and polling
    modeRef.current = mode;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts: number; data: DashboardData };
        // accept cache younger than 2 minutes
        if (Date.now() - parsed.ts < 2 * 60 * 1000) {
          setDisplayData(parsed.data);
        }
      }
    } catch (err) {
      // ignore cache errors
    }

    // initial load and config load
    load(modeRef.current);
    loadConfigs();

    // Polling: only poll when the tab is visible to avoid extra work
    const intervalFn = () => {
      if (document.visibilityState === 'visible') {
        load(modeRef.current);
      }
    };
    const id = setInterval(intervalFn, 10000);

    // also reload once when tab becomes visible
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load(modeRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEsModal = () => setEsModalVisible(true);
  const openWebhookModal = () => setWebhookModalVisible(true);

  const onEsSave = async (values:any) => {
    try {
      const res = await setESConfig(values);
      setEsConfigState(res);
      setEsModalVisible(false);
      message.success('ES config saved');
    } catch (e:any) {
      console.error(e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save ES config';
      message.error(detail);
    }
  }

  const onWebhookSave = async (values:any) => {
    try {
      // parse headers if it's a string from textarea
      if (typeof values.headers === 'string') {
        try {
          values.headers = JSON.parse(values.headers || '{}');
        } catch (err) {
          message.error('Headers is not valid JSON');
          return;
        }
      }
      const res = await setWebhookConfig(values);
      setWebhookConfigState(res);
      setWebhookModalVisible(false);
      message.success('Webhook config saved');
    } catch (e:any) {
      console.error(e);
      const detail = e?.response?.data?.detail || e?.message || 'Failed to save webhook config';
      message.error(detail);
    }
  }

  return (
  <>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Select value={mode} onChange={(v) => { setMode(v as any); modeRef.current = v as any; load(v as any); }} style={{ width: 160 }}>
            <Option value="auto">Auto (use config)</Option>
            <Option value="es">Force ES</Option>
            <Option value="mock">Force Mock</Option>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div>
            <Button onClick={openEsModal} style={{ marginRight: 8 }}>ES Settings</Button>
            <Button onClick={openWebhookModal}>Webhook Settings</Button>
          </div>
          {refreshing && <Spin size="small" style={{ marginLeft: 12 }} />}
        </div>
      </Space>

      <Row gutter={16} style={{ marginTop: 16 }}>
        {/** use displayData (last successful) to avoid blanking while loading */}
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Alerts"
              value={useAnimatedNumber(displayData?.total ?? 0, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Critical"
              value={useAnimatedNumber(displayData?.severity?.Critical ?? 0, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Warning"
              value={useAnimatedNumber(displayData?.severity?.Warning ?? 0, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Info"
              value={useAnimatedNumber(displayData?.severity?.Info ?? 0, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </Col>
      </Row>

      {/* source_index 饼图（AntD Plots Pie） */}
      {displayData?.source_index && Object.keys(displayData.source_index).length > 0 && (
        <Card title="Source Index Distribution" style={{ marginTop: 24 }}>
          <Pie
            data={Object.entries(displayData.source_index).map(([type, value]) => ({ type: type ?? String(type), value }))}
            angleField="value"
            colorField="type"
            radius={0.8}
            height={320}
            label={{
              text: (d: any) => `${d.type}\n ${d.value}`,
              position: 'spider',
            }}
            legend={{
              color: {
                title: false,
                position: 'right',
                rowPadding: 5,
              },
            }}
          />
        </Card>
      )}

      {/* daily_trend 折线图（AntD Line） */}
      {displayData?.daily_trend && Object.keys(displayData.daily_trend).length > 0 && (
        <Card title="Daily Alert Trend" style={{ marginTop: 24 }}>
          <Line
            data={Object.entries(displayData.daily_trend).map(([date, count]) => ({ date, count }))}
            xField="date"
            yField="count"
            height={320}
            point={{ size: 5, shape: 'diamond' }}
            smooth
            area={{}}
          />
        </Card>
      )}

      {/* message top10 柱状图（AntD Plots Column，参考DemoColumn样式） */}
      {displayData?.top_messages && Object.keys(displayData.top_messages).length > 0 && (
        <Card title="Top 10 Messages" style={{ marginTop: 24 }}>
          <Column
            data={Object.entries(displayData.top_messages).slice(0, 10).map(([type, value]) => ({ type, value }))}
            xField="type"
            yField="value"
            colorField="type"
            height={320}
            legend={{
              position: 'right',
              itemName: {
                style: {
                  fontSize: 14,
                  wordBreak: 'break-all',
                  maxWidth: 220,
                },
              },
            }}
            label={false}
            yAxis={{
              title: {
                text: 'Count',
                style: { fontSize: 14 },
              },
            }}
            tooltip={{ showMarkers: false }}
            axis={{ x: false }}
          />
        </Card>
      )}

      <Modal title="ES Settings" open={esModalVisible} onCancel={() => setEsModalVisible(false)} footer={null}>
        <Form initialValues={esConfig || {enabled: false, hosts: '', index: 'alerts', use_ssl: false, verify_certs: true}} onFinish={onEsSave}>
          <Form.Item name="enabled" valuePropName="checked" label="Enabled">
            <Switch />
          </Form.Item>
          <Form.Item name="hosts" label="Hosts">
            <Input placeholder="http://localhost:9200" />
          </Form.Item>
          <Form.Item name="index" label="Index">
            <Input placeholder="alerts" />
          </Form.Item>
          <Form.Item name="username" label="Username">
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password">
            <Input.Password />
          </Form.Item>
          <Form.Item name="use_ssl" valuePropName="checked" label="Use SSL">
            <Switch />
          </Form.Item>
          <Form.Item name="verify_certs" valuePropName="checked" label="Verify Certs">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Button htmlType="submit" type="primary">Save</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Webhook Settings" open={webhookModalVisible} onCancel={() => setWebhookModalVisible(false)} footer={null}>
        <Form initialValues={webhookConfig || {url: '', method: 'POST', headers: {}, active: true}} onFinish={onWebhookSave}>
          <Form.Item name="url" label="URL" rules={[{ required: true, message: 'Please enter URL' }]}> <Input /> </Form.Item>
          <Form.Item name="method" label="Method"> <Input /> </Form.Item>
          <Form.Item name="active" valuePropName="checked" label="Active"> <Switch /> </Form.Item>
          <Form.Item name="headers" label="Headers (JSON)"> <Input.TextArea placeholder='{"Authorization":"Bearer ..."}' /> </Form.Item>
          <Form.Item>
            <Button htmlType="submit" type="primary">Save</Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default Dashboard;
