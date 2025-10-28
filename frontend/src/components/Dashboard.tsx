import React, { useEffect, useState } from 'react';
import { Card, Statistic, Row, Col, Space, Select, Button, Modal, Form, Input, Switch, message } from 'antd';
import ReactECharts from 'echarts-for-react';
import { fetchDashboard, getESConfig, setESConfig, getWebhookConfig, setWebhookConfig } from '../api';
import { DashboardData } from '../types';

const { Option } = Select;

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [mode, setMode] = useState<'auto'|'es'|'mock'>('auto');
  const [esModalVisible, setEsModalVisible] = useState(false);
  const [webhookModalVisible, setWebhookModalVisible] = useState(false);
  const [esConfig, setEsConfigState] = useState<any>(null);
  const [webhookConfig, setWebhookConfigState] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchDashboard(mode === 'es');
      setData(res);
    } catch (e:any) {
      console.error('Dashboard load error', e);
      message.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
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

  useEffect(() => {
    load();
    loadConfigs();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [mode]);

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
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <Select value={mode} onChange={(v) => setMode(v as any)} style={{ width: 160 }}>
          <Option value="auto">Auto (use config)</Option>
          <Option value="es">Force ES</Option>
          <Option value="mock">Force Mock</Option>
        </Select>
        <div>
          <Button onClick={openEsModal} style={{ marginRight: 8 }}>ES Settings</Button>
          <Button onClick={openWebhookModal}>Webhook Settings</Button>
        </div>
      </Space>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Card><Statistic title="Total Alerts" value={data?.total || 0} loading={loading}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="Critical" value={data?.severity?.Critical || 0} loading={loading}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="Warning" value={data?.severity?.Warning || 0} loading={loading}/></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="Info" value={data?.severity?.Info || 0} loading={loading}/></Card>
        </Col>
      </Row>

      {/* 新增 source_index 饼图 */}
      {data?.source_index && Object.keys(data.source_index).length > 0 && (
        <Card title="Source Index Distribution" style={{ marginTop: 24 }}>
          <ReactECharts style={{ height: 320 }} option={{
            tooltip: { trigger: 'item' },
            legend: { top: 'bottom' },
            series: [{
              type: 'pie',
              radius: '60%',
              data: Object.entries(data.source_index).map(([name, value]) => ({ name, value })),
            }]
          }} />
        </Card>
      )}

      {/* 新增 daily_trend 折线图 */}
      {data?.daily_trend && Object.keys(data.daily_trend).length > 0 && (
        <Card title="Daily Alert Trend" style={{ marginTop: 24 }}>
          <ReactECharts style={{ height: 320 }} option={{
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: Object.keys(data.daily_trend) },
            yAxis: { type: 'value' },
            series: [{
              data: Object.values(data.daily_trend),
              type: 'line',
              smooth: true,
              areaStyle: {},
            }]
          }} />
        </Card>
      )}

      {/* 新增 top_keywords 词云/柱状图 */}
      {data?.top_keywords && Object.keys(data.top_keywords).length > 0 && (
        <Card title="Top Message Keywords" style={{ marginTop: 24 }}>
          <ReactECharts style={{ height: 320 }} option={{
            tooltip: {},
            xAxis: { type: 'category', data: Object.keys(data.top_keywords) },
            yAxis: { type: 'value' },
            series: [{
              data: Object.values(data.top_keywords),
              type: 'bar',
              itemStyle: { color: '#5470c6' },
            }]
          }} />
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
