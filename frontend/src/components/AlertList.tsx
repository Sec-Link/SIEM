import React, { useEffect, useState, useContext } from 'react';
import { Table, Tag, Typography } from 'antd';
import { fetchAlerts } from '../api';
import { Alert } from '../types';
import ModeContext from '../modeContext';

const { Text } = Typography;

const AlertList: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState<number>(0);
  const [source, setSource] = useState<string | null>(null);
  const [lastLoadMs, setLastLoadMs] = useState<number | null>(null);

  const { mode } = useContext(ModeContext);

  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    const start = performance.now();
    try {
      const res = await fetchAlerts(p, ps, mode);
      setAlerts(res.alerts || []);
      setTotal(res.total || (res.alerts || []).length);
      setSource(res.source || null);
    } catch (err) {
      console.error('Failed to load alerts', err);
      setAlerts([]);
      setTotal(0);
      setSource(null);
    } finally {
      setLoading(false);
      const ms = Math.round(performance.now() - start);
      setLastLoadMs(ms);
      if (ms > 1000) console.warn(`AlertList load took ${ms}ms`);
    }
  };

  useEffect(() => { load(1, pageSize); setPage(1); }, [mode]);

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong>告警列表</Text>
          {source && <Text type="secondary" style={{ marginLeft: 12 }}>来源: {source}{lastLoadMs ? ` • ${lastLoadMs}ms` : ''}</Text>}
        </div>
      </div>

      <Table
        rowKey="alert_id"
        dataSource={alerts}
        loading={loading}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); load(p, ps); }
        }}
        columns={[
          { title: 'ID', dataIndex: 'alert_id' },
          { title: '时间', dataIndex: 'timestamp' },
          { title: '级别', dataIndex: 'severity', render: (sev: string) => <Tag color={sev==='Critical'?'red':sev==='Warning'?'orange':'blue'}>{sev}</Tag> },
          { title: '描述', dataIndex: 'message' },
          { title: '来源索引', dataIndex: 'source_index' }
        ]}
      />
    </div>
  );
};

export default AlertList;
