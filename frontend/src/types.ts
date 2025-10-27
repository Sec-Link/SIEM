export interface Alert {
  alert_id: string;
  tenant_id: string;
  timestamp: string;
  severity: 'Critical' | 'Warning' | 'Info';
  message: string;
  source_index: string;
}

export interface DashboardData {
  severity: Record<string, number>;
  timeline: Record<string, number>;
  total: number;
  source?: string;
  source_index?: Record<string, number>;
  daily_trend?: Record<string, number>;
  top_keywords?: Record<string, number>;
}

export interface Ticket {
  ticket_id: string;
  tenant_id: string;
  status: string;
  title: string;
  description: string;
  related_alert_id?: string;
  created_at: string;
}
