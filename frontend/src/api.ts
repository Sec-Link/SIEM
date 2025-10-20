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

export async function login(username: string, password: string) {
  const res = await client.post('/auth/login/', { username, password });
  setAccessToken(res.data.access);
  return res.data;
}

export async function fetchAlerts(page = 1, page_size = 20) {
  const res = await client.get(`/alerts/list/?page=${page}&page_size=${page_size}`);
  return res.data;
}

export async function fetchDashboard() {
  const res = await client.get('/alerts/dashboard/');
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
