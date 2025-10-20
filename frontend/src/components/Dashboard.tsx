import React, { useEffect, useState } from 'react';
import { Card, Statistic, Row, Col } from 'antd';
import { fetchDashboard } from '../api';
import { DashboardData } from '../types';

const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);

  const load = async () => {
    const res = await fetchDashboard();
    setData(res);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <Row gutter={16} style={{ marginTop: 16 }}>
      <Col span={6}>
        <Card><Statistic title="Total Alerts" value={data?.total || 0} /></Card>
      </Col>
      <Col span={6}>
        <Card><Statistic title="Critical" value={data?.severity?.Critical || 0} /></Card>
      </Col>
      <Col span={6}>
        <Card><Statistic title="Warning" value={data?.severity?.Warning || 0} /></Card>
      </Col>
      <Col span={6}>
        <Card><Statistic title="Info" value={data?.severity?.Info || 0} /></Card>
      </Col>
    </Row>
  );
};

export default Dashboard;
