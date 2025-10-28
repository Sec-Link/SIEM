import axios, { InternalAxiosRequestConfig } from 'axios';

let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

const client = axios.create({ baseURL: '/api/v1' });
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    if (!config.headers) {
      config.headers = {} as any;
    }
    (config.headers as any).Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export async function login(username: string, password: string, tenant_id?: string) {
  const payload: any = { username, password };
  if (tenant_id) payload.tenant_id = tenant_id;
  const res = await client.post('/auth/login/', payload);
  setAccessToken(res.data.access);
  return res.data;
}

export async function fetchAlerts(page = 1, page_size = 20) {
  const res = await client.get(`/alerts/list/?page=${page}&page_size=${page_size}`);
  return res.data;
}

export async function fetchDashboard(force_es?: boolean) {
  let url = '/alerts/dashboard/';
  if (force_es) url += '?force_es=1';
  const res = await client.get(url);
  return res.data;
}

export async function fetchTickets() {
  const res = await client.get('/tickets/');
  return res.data;
}

export async function createTicket(payload: Partial<{ title: string; description: string; related_alert_id?: string }>) {
  const res = await client.post('/tickets/', { ...payload, status: 'Open' });
  return res.data;
}

export async function getESConfig() {
  const res = await client.get('/alerts/config/es/');
  return res.data;
}

export async function setESConfig(payload: any) {
  const res = await client.post('/alerts/config/es/', payload);
  return res.data;
}

export async function getWebhookConfig() {
  const res = await client.get('/alerts/config/webhook/');
  return res.data;
}

export async function setWebhookConfig(payload: any) {
  const res = await client.post('/alerts/config/webhook/', payload);
  return res.data;
}
