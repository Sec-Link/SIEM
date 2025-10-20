import React, { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import { fetchAlerts } from '../api';
import { Alert } from '../types';

const AlertList: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const load = async () => {
    const res = await fetchAlerts(1, 100);
    setAlerts(res.alerts);
  };

  useEffect(() => { load(); }, []);

  return (
    <Table rowKey="alert_id" dataSource={alerts} pagination={false} columns={[
      { title: 'ID', dataIndex: 'alert_id' },
      { title: '时间', dataIndex: 'timestamp' },
      { title: '级别', dataIndex: 'severity', render: (sev: string) => <Tag color={sev==='Critical'?'red':sev==='Warning'?'orange':'blue'}>{sev}</Tag> },
      { title: '描述', dataIndex: 'message' },
      { title: '来源索引', dataIndex: 'source_index' }
    ]} />
  );
};

export default AlertList;
