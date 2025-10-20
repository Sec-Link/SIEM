import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict

MOCK_FILE = Path(__file__).resolve().parent / 'mock_alerts.json'

class AlertService:
    @staticmethod
    def load_mock_alerts() -> List[Dict]:
        with open(MOCK_FILE) as f:
            data = json.load(f)
        return data

    @staticmethod
    def list_alerts_for_tenant(tenant_id: str) -> List[Dict]:
        alerts = AlertService.load_mock_alerts()
        return [a for a in alerts if a['tenant_id'] == tenant_id]

    @staticmethod
    def aggregate_dashboard(tenant_id: str) -> Dict:
        alerts = AlertService.list_alerts_for_tenant(tenant_id)
        severity_counts = {}
        timeline = {}
        for a in alerts:
            sev = a['severity']
            severity_counts[sev] = severity_counts.get(sev, 0) + 1
            # group by hour
            hour = a['timestamp'][:13]  # YYYY-MM-DDTHH
            timeline[hour] = timeline.get(hour, 0) + 1
        return {'severity': severity_counts, 'timeline': timeline, 'total': len(alerts)}
