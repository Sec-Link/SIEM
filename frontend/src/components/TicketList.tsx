import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Tag } from 'antd';
import { fetchTickets, createTicket } from '../api';
import { Ticket } from '../types';

const TicketList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const res = await fetchTickets();
    setTickets(res);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    await createTicket(values);
    setLoading(false);
    setOpen(false);
    form.resetFields();
    load();
  };

  return (
    <>
      <Button type="primary" onClick={() => setOpen(true)} style={{ marginBottom: 12 }}>新建工单</Button>
      <Table rowKey="ticket_id" dataSource={tickets} pagination={false} columns={[
        { title: 'ID', dataIndex: 'ticket_id' },
        { title: '标题', dataIndex: 'title' },
        { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s==='Open'?'green':s==='In Progress'?'blue':'gray'}>{s}</Tag> },
        { title: '描述', dataIndex: 'description' },
        { title: '关联告警', dataIndex: 'related_alert_id' },
        { title: '创建时间', dataIndex: 'created_at' }
      ]} />
      <Modal open={open} title="新建工单" onCancel={() => setOpen(false)} onOk={submit} confirmLoading={loading}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="related_alert_id" label="关联告警">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default TicketList;
