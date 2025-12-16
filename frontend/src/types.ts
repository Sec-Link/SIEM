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
  top_messages?: Record<string, number>;

  // Extended DB-backed dashboard metrics
  recent_1h_alerts?: number | null;
  data_source_count?: number | null;
  enabled_siem_rule_count?: number | null;
  siem_rule_detected_count_1h?: number | null;

  // Extended dashboard blocks
  category_breakdown?: Record<string, number>;
  severity_distribution?: Record<string, number>;
  alert_trend?: Record<string, number>;
  alert_score_trend?: Record<string, number>;
  // Optional stacked-series versions for segmented/stacked bar charts
  alert_trend_series?: Array<{ time: string; series: string; value: number }>;
  alert_score_trend_series?: Array<{ time: string; series: string; value: number }>;
  top_source_ips?: Array<{ name: string; count: number }>;
  top_users?: Array<{ name: string; count: number }>;
  top_sources?: Array<{ name: string; count: number }>;
  top_rules?: Array<{ name: string; count: number }>;
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

export interface Integration {  
  integration_id: string;
  tenant_id: string;
  status: string;
  title: string;
  description: string;
  related_alert_id?: string;
  created_at: string;
}