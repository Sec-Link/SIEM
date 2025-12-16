import React, { useEffect, useState, useContext } from 'react';
import { Pie } from '@ant-design/charts';
import { Column } from '@ant-design/plots';
import { Card, Statistic, Row, Col, Space, Select, Button, Modal, Form, Input, Switch, message, Spin, Table } from 'antd';
import { fetchDashboard, syncAlertsToDb, getESConfig, setESConfig, getWebhookConfig, setWebhookConfig } from '../api';
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
  const DB_SYNC_MIN_INTERVAL_MS = 60 * 1000; // throttle ES->DB refresh in Force DB mode
  const lastDbSyncAtRef = React.useRef<number>(0);
  const [esModalVisible, setEsModalVisible] = useState(false);
  const [webhookModalVisible, setWebhookModalVisible] = useState(false);
  const [esConfig, setEsConfigState] = useState<any>(null);
  const [webhookConfig, setWebhookConfigState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [trendGroupBy, setTrendGroupBy] = useState<'hour' | 'day'>('hour');
  const [scoreGroupBy, setScoreGroupBy] = useState<'hour' | 'day'>('hour');

  const bucketizeTimeSeries = (
    series: Record<string, number> | undefined,
    unit: 'hour' | 'day'
  ) => {
    if (!series) return [] as Array<{ time: string; value: number }>;
    const acc: Record<string, number> = {};
    for (const [k, v] of Object.entries(series)) {
      if (!k) continue;
      // Backend hour keys may look like:
      // - 2025-12-16T12
      // - 2025-12-16T12+00:00
      // - 2025-12-16T12:00:00+00:00
      // Normalize to stable "YYYY-MM-DD" or "YYYY-MM-DDTHH" buckets.
      let key = unit === 'day' ? k.slice(0, 10) : k.slice(0, 13);
      if (key.endsWith(':')) key = key.slice(0, -1);
      acc[key] = (acc[key] || 0) + (Number(v) || 0);
    }
    return Object.entries(acc)
      .sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
      .map(([time, value]) => ({ time, value }));
  };

  const bucketizeStackedSeries = (
    rows: Array<{ time: string; series: string; value: number }> | undefined,
    unit: 'hour' | 'day'
  ) => {
    if (!rows || rows.length === 0) return [] as Array<{ time: string; series: string; value: number }>;
    const acc: Record<string, number> = {};
    for (const r of rows) {
      if (!r?.time) continue;
      let timeKey = unit === 'day' ? r.time.slice(0, 10) : r.time.slice(0, 13);
      if (timeKey.endsWith(':')) timeKey = timeKey.slice(0, -1);
      const seriesKey = r.series || 'unknown';
      const k = `${timeKey}__${seriesKey}`;
      acc[k] = (acc[k] || 0) + (Number(r.value) || 0);
    }
    return Object.entries(acc)
      .map(([k, value]) => {
        const idx = k.indexOf('__');
        return { time: k.slice(0, idx), series: k.slice(idx + 2), value };
      })
      .sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : a.series.localeCompare(b.series)));
  };

  const load = async (m?: 'auto'|'db'|'es'|'mock') => {
    const useMode = m ?? modeRef.current;
    const isBackground = !!displayData;
    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      // Force DB = render strictly from DB. To keep DB fresh without a separate scheduler,
      // we trigger an on-demand ES->DB refresh (best-effort) before fetching the dashboard.
      if (useMode === 'db') {
        const now = Date.now();
        if (!lastDbSyncAtRef.current || now - lastDbSyncAtRef.current >= DB_SYNC_MIN_INTERVAL_MS) {
          try {
            await syncAlertsToDb(200);
            lastDbSyncAtRef.current = now;
          } catch (e) {
            // Ignore sync errors so dashboard can still show existing DB data.
            console.warn('Force DB: ES->DB sync failed (ignored)', e);
          }
        }
      }
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
            <Option value="db">Force DB</Option>
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

      {/* Single numbers (responsive + full-width fill) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          marginTop: 16,
          width: '100%',
        }}
      >
        <div style={{ flex: '1 1 220px', minWidth: 220 }}>
          <Card title="最近1小时告警">
            <Statistic
              value={useAnimatedNumber((displayData?.recent_1h_alerts ?? 0) as number, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 220 }}>
          <Card title="累计告警">
            <Statistic
              value={useAnimatedNumber(displayData?.total ?? 0, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 220 }}>
          <Card title="数据源">
            <Statistic
              value={useAnimatedNumber((displayData?.data_source_count ?? 0) as number, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 220 }}>
          <Card title="启用SIEM规则数">
            <Statistic
              value={useAnimatedNumber((displayData?.enabled_siem_rule_count ?? 0) as number, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 220 }}>
          <Card title="SIEM规则检测数（近1小时）">
            <Statistic
              value={useAnimatedNumber((displayData?.siem_rule_detected_count_1h ?? 0) as number, 600)}
              loading={!displayData && loading}
              valueStyle={{ transition: 'all 0.5s cubic-bezier(.08,.82,.17,1)' }}
            />
          </Card>
        </div>
      </div>

      {/* Row 1: Pie#1 + Bar#1 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          {displayData?.category_breakdown && Object.keys(displayData.category_breakdown).length > 0 && (
            <Card title="告警分类占比">
              <Pie
                data={Object.entries(displayData.category_breakdown).map(([type, value]) => ({ type, value }))}
                angleField="value"
                colorField="type"
                radius={0.8}
                height={320}
                label={{ text: (d: any) => `${d.type}\n ${d.value}`, position: 'spider' }}
                legend={{ color: { title: false, position: 'right', rowPadding: 5 } }}
              />
            </Card>
          )}
        </Col>
        <Col xs={24} lg={14}>
          {displayData?.alert_trend && Object.keys(displayData.alert_trend).length > 0 && (
            <Card
              title="告警趋势"
              extra={
                <Space>
                  <span>Group by</span>
                  <Select
                    size="small"
                    value={trendGroupBy}
                    onChange={(v) => setTrendGroupBy(v as 'hour' | 'day')}
                    style={{ width: 120 }}
                    options={[
                      { label: '1 hour', value: 'hour' },
                      { label: '1 day', value: 'day' },
                    ]}
                  />
                </Space>
              }
            >
              {displayData?.alert_trend_series && displayData.alert_trend_series.length > 0 ? (
                <Column
                  data={bucketizeStackedSeries(displayData.alert_trend_series, trendGroupBy).map((r) => ({
                    time: r.time,
                    severity: r.series,
                    count: r.value,
                  }))}
                  xField="time"
                  yField="count"
                  colorField="severity"
                  stack={{
                    // bottom -> top
                    orderBy: (d: any) =>
                      ({ low: 0, medium: 1, high: 2, critical: 3, unknown: 4 } as any)[
                        String(d?.severity ?? 'unknown').toLowerCase()
                      ] ?? 99,
                  }}
                  scale={{
                    x: { type: 'band' },
                    color: {
                      domain: ['low', 'medium', 'high', 'critical', 'unknown'],
                      range: ['#1677ff', '#fadb14', '#fa8c16', '#ff4d4f', '#8c8c8c'],
                    },
                  }}
                  height={320}
                  label={false}
                  tooltip={{ showMarkers: false }}
                  axis={{
                    x: {
                      title: false,
                      labelAutoRotate: true,
                      labelFormatter: (v: any) => {
                        const s = String(v ?? '');
                        // show timestamp under x-axis
                        if (s.includes('T')) return s.replace('T', ' ') + ':00';
                        return s;
                      },
                    },
                    y: { title: false },
                  }}
                  legend={{ position: 'top' }}
                />
              ) : (
                <Column
                  data={bucketizeTimeSeries(displayData.alert_trend, trendGroupBy).map((d) => ({ time: d.time, count: d.value }))}
                  xField="time"
                  yField="count"
                  colorField="time"
                  legend={false}
                  height={320}
                  label={false}
                  tooltip={{ showMarkers: false }}
                  axis={{ x: false }}
                />
              )}
            </Card>
          )}
        </Col>
      </Row>

      {/* Row 2: Pie#2 + Bar#2 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          {displayData?.severity_distribution && Object.keys(displayData.severity_distribution).length > 0 && (
            <Card title="告警严重分布">
              <Pie
                data={Object.entries(displayData.severity_distribution).map(([type, value]) => ({ type, value }))}
                angleField="value"
                colorField="type"
                radius={0.8}
                height={320}
                label={{ text: (d: any) => `${d.type}\n ${d.value}`, position: 'spider' }}
                legend={{ color: { title: false, position: 'right', rowPadding: 5 } }}
              />
            </Card>
          )}
        </Col>
        <Col xs={24} lg={14}>
          {displayData?.alert_score_trend && Object.keys(displayData.alert_score_trend).length > 0 && (
            <Card
              title="告警分数趋势"
              extra={
                <Space>
                  <span>Group by</span>
                  <Select
                    size="small"
                    value={scoreGroupBy}
                    onChange={(v) => setScoreGroupBy(v as 'hour' | 'day')}
                    style={{ width: 120 }}
                    options={[
                      { label: '1 hour', value: 'hour' },
                      { label: '1 day', value: 'day' },
                    ]}
                  />
                </Space>
              }
            >
              {displayData?.alert_score_trend_series && displayData.alert_score_trend_series.length > 0 ? (
                <Column
                  data={bucketizeStackedSeries(displayData.alert_score_trend_series, scoreGroupBy).map((r) => ({
                    time: r.time,
                    severity: r.series,
                    score: r.value,
                  }))}
                  xField="time"
                  yField="score"
                  colorField="severity"
                  stack={{
                    // bottom -> top
                    orderBy: (d: any) =>
                      ({ low: 0, medium: 1, high: 2, critical: 3, unknown: 4 } as any)[
                        String(d?.severity ?? 'unknown').toLowerCase()
                      ] ?? 99,
                  }}
                  scale={{
                    x: { type: 'band' },
                    color: {
                      domain: ['low', 'medium', 'high', 'critical', 'unknown'],
                      range: ['#1677ff', '#fadb14', '#fa8c16', '#ff4d4f', '#8c8c8c'],
                    },
                  }}
                  height={320}
                  label={false}
                  tooltip={{ showMarkers: false }}
                  axis={{
                    x: {
                      title: false,
                      labelAutoRotate: true,
                      labelFormatter: (v: any) => {
                        const s = String(v ?? '');
                        if (s.includes('T')) return s.replace('T', ' ') + ':00';
                        return s;
                      },
                    },
                    y: { title: false },
                  }}
                  legend={{ position: 'top' }}
                />
              ) : (
                <Column
                  data={bucketizeTimeSeries(displayData.alert_score_trend, scoreGroupBy).map((d) => ({ time: d.time, score: d.value }))}
                  xField="time"
                  yField="score"
                  colorField="time"
                  legend={false}
                  height={320}
                  label={false}
                  tooltip={{ showMarkers: false }}
                  axis={{ x: false }}
                />
              )}
            </Card>
          )}
        </Col>
      </Row>

      {/* Tables (responsive) */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12} xl={6}>
          <Card title="Top Source 10 IP">
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => r.name}
              columns={[
                { title: 'IP', dataIndex: 'name' },
                { title: 'Count', dataIndex: 'count', width: 90 },
              ]}
              dataSource={(displayData?.top_source_ips ?? []) as any}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Top 10 用户">
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => r.name}
              columns={[
                { title: 'User', dataIndex: 'name' },
                { title: 'Count', dataIndex: 'count', width: 90 },
              ]}
              dataSource={(displayData?.top_users ?? []) as any}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Top 10 来源">
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => r.name}
              columns={[
                { title: 'Source', dataIndex: 'name' },
                { title: 'Count', dataIndex: 'count', width: 90 },
              ]}
              dataSource={(displayData?.top_sources ?? []) as any}
            />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card title="Top 10 规则">
            <Table
              size="small"
              pagination={false}
              rowKey={(r) => r.name}
              columns={[
                { title: 'Rule', dataIndex: 'name' },
                { title: 'Count', dataIndex: 'count', width: 90 },
              ]}
              dataSource={(displayData?.top_rules ?? []) as any}
            />
          </Card>
        </Col>
      </Row>

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
