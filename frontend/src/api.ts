import axios, { InternalAxiosRequestConfig } from 'axios';

let accessToken: string | null = null;

export function setAccessToken(token: string) {
  accessToken = token;
}

// initialize from persistent storage if available
try {
  const persisted = localStorage.getItem('siem_access_token');
  if (persisted) accessToken = persisted;
} catch (err) {}

export function clearAccessToken() {
  accessToken = null;
  try { localStorage.removeItem('siem_access_token'); } catch (e) {}
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
  try {
    // persist token for page reloads
    localStorage.setItem('siem_access_token', res.data.access);
    if (res.data.tenant_id) localStorage.setItem('siem_tenant_id', res.data.tenant_id);
    // store username for UI display (fall back to provided username)
    if (res.data.username) localStorage.setItem('siem_username', res.data.username);
    else if (username) localStorage.setItem('siem_username', username);
  } catch (err) {
    // ignore storage errors
  }
  return res.data;
}

export async function fetchAlerts(page = 1, page_size = 20, mode?: 'es'|'mock'|'auto'|'db') {
  let url = `/alerts/list/?page=${page}&page_size=${page_size}`;
  if (mode === 'es') url += '&force_es=1';
  else if (mode === 'mock') url += '&mock=1';
  else if (mode === 'db') url += '&force_db=1';
  const res = await client.get(url);
  return res.data;
}

export async function fetchDashboard(mode?: 'es' | 'mock' | 'auto' | 'db') {
  let url = '/alerts/dashboard/';
  if (mode === 'es') {
    url += '?force_es=1';
  } else if (mode === 'mock') {
    url += '?mock=1';
  } else if (mode === 'db') {
    url += '?force_db=1';
  }
  const res = await client.get(url);
  return res.data;
}

export async function syncAlertsToDb(size: number = 100) {
  const url = `/alerts/sync/?size=${encodeURIComponent(String(size))}`;
  const res = await client.post(url);
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

export async function getDatasourceFields(table: string){
  const r = await client.get(`/datasource/fields?table=${encodeURIComponent(table)}`)
  return r.data
}

export async function listDatasources(){
  const r = await client.get('/datasources/')
  return r.data
}

// Dataset APIs removed — use DataSource + SQL preview instead

export async function queryPreview(payload:any){
  const r = await client.post('/query/preview', payload)
  return r.data
}

export async function createDatasource(payload:any){
  const r = await client.post('/datasources/', payload)
  return r.data
}

export async function updateDatasource(id:string, payload:any){
  const r = await client.put(`/datasources/${id}/`, payload)
  return r.data
}

export async function deleteDatasource(id:string){
  const r = await client.delete(`/datasources/${id}/`)
  return r.data
}

export async function testDatasource(payload:any){
  const r = await client.post('/datasource/test', payload)
  return r.data
}

export async function testEsIntegration(payload:any){
  const r = await client.post('/integrations/test_es', payload)
  return r.data
}

export async function testLogstashIntegration(payload:any){
  const r = await client.post('/integrations/test_logstash', payload)
  return r.data
}

export async function testAirflowIntegration(payload:any){
  const r = await client.post('/integrations/test_airflow', payload)
  return r.data
}

export async function previewEsIntegration(payload:any){
  const r = await client.post('/integrations/preview_es', payload)
  return r.data
}

export async function integrationsDbTables(payload:any){
  const r = await client.post('/integrations/db_tables', payload)
  return r.data
}

export async function integrationsCreateTable(payload:any){
  const r = await client.post('/integrations/create_table', payload)
  return r.data
}

export async function integrationsCreateTableFromEs(payload:any){
  const r = await client.post('/integrations/create_table_from_es', payload)
  return r.data
}

export async function integrationsPreviewEsMapping(payload:any){
  const r = await client.post('/integrations/preview_es_mapping', payload)
  return r.data
}

// Integrations CRUD
export async function listIntegrations(){
  const r = await client.get('/integrations/')
  return r.data
}

export async function createIntegration(payload:any){
  const r = await client.post('/integrations/', payload)
  return r.data
}

export async function updateIntegration(id:string, payload:any){
  const r = await client.put(`/integrations/${id}/`, payload)
  return r.data
}

export async function deleteIntegration(id:string){
  const r = await client.delete(`/integrations/${id}/`)
  return r.data
}

export default client

// Dashboards API
export async function listDashboards(){
  const r = await client.get('/dashboards/')
  return r.data
}

export async function createDashboard(payload:any){
  const r = await client.post('/dashboards/', payload)
  return r.data
}

export async function getDashboard(id:string){
  const r = await client.get(`/dashboards/${id}/`)
  return r.data
}

export async function updateDashboard(id:string, payload:any){
  const r = await client.put(`/dashboards/${id}/`, payload)
  return r.data
}

export async function deleteDashboard(id:string){
  const r = await client.delete(`/dashboards/${id}/`)
  return r.data
}
