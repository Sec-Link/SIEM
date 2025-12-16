from rest_framework import viewsets
from .models import DataSet
from .serializers import DataSetSerializer
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import DataSource
from .datasource_adapters import list_table_columns
from .datasource_adapters import run_query
from rest_framework.decorators import api_view
from rest_framework import status
import requests
from requests.auth import HTTPBasicAuth
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
import traceback
import re

# -----------------------------
# 中文注释：
# 本模块包含 DataSet / DataSource 的 REST 接口实现：
# - 提供数据集（DataSet）的标准 CRUD（DataSetViewSet）
# - 提供数据源（DataSource）测试、表/字段发现、SQL 预览、以及数据预览逻辑（datasource_fields, datasource_test, dataset_preview, dataset_fields, query_preview）
# - 该模块大量使用 SQLAlchemy 作为临时连接/测试工具，并对传入的连接信息做基本验证与调试输出
#
# 注意：本文件添加的注释不会更改现有行为；运行时需要 requests 与 sqlalchemy 等依赖可用。
# -----------------------------


@api_view(['GET'])
def datasource_fields(request):
    table = request.query_params.get('table')
    ds_id = request.query_params.get('datasource')
    # If table looks like a dataset id, try to introspect payload
    if ds_id:
        try:
            ds = DataSource.objects.filter(id=ds_id).first()
            if ds and table:
                cols = list_table_columns(ds, table)
                if cols:
                    return Response(cols)
        except Exception:
            pass

    if table:
        try:
            ds = DataSet.objects.filter(id=table).first()
            if ds and ds.payload:
                # payload might be a list of objects or dict
                p = ds.payload
                if isinstance(p, list) and len(p)>0 and isinstance(p[0], dict):
                    fields = [{ 'name': k, 'type': 'string' } for k in p[0].keys()]
                    return Response(fields)
                if isinstance(p, dict):
                    fields = [{ 'name': k, 'type': 'string' } for k in p.keys()]
                    return Response(fields)
        except Exception:
            pass

    # fallback example schema
    example = [
        { 'name': 'category', 'type': 'string' },
        { 'name': 'value', 'type': 'number' },
        { 'name': 'date', 'type': 'date' },
        { 'name': 'x', 'type': 'number' },
        { 'name': 'y', 'type': 'number' }
    ]
    return Response(example)


@api_view(['POST'])
def datasource_test(request):
    """Test a datasource connection using SQLAlchemy. Accepts either a datasource id
    (existing DataSource) or connection payload in the POST body.
    Returns { ok: true } on success or { ok: false, error: '...' } on failure.
    """
    payload = request.data or {}
    # Debug: print incoming payload and content type to help diagnose 400s
    try:
        print('DEBUG datasource_test payload:', payload)
        print('DEBUG Content-Type:', request.META.get('CONTENT_TYPE'))
        raw = request.body
        if raw:
            try:
                print('DEBUG raw body:', raw.decode('utf-8'))
            except Exception:
                print('DEBUG raw body (binary):', raw[:200])
    except Exception:
        pass
    ds_id = payload.get('id') or request.query_params.get('datasource')

    ds = None
    if ds_id:
        ds = DataSource.objects.filter(id=ds_id).first()

    # If not found, attempt to construct from provided payload
    if not ds:
        # we expect keys: db_type, user, password, host, port, database
        class TempDS:
            pass

        ds = TempDS()
        ds.db_type = payload.get('db_type')
        ds.user = payload.get('user')
        ds.password = payload.get('password')
        ds.host = payload.get('host')
        # Coerce port: treat empty string as None and try int-cast if possible
        p = payload.get('port')
        if p is None or (isinstance(p, str) and p.strip() == ''):
            ds.port = None
        else:
            try:
                ds.port = int(p)
            except Exception:
                ds.port = p
        ds.database = payload.get('database')

    url = None
    from .datasource_adapters import build_sqlalchemy_url
    try:
        url = build_sqlalchemy_url(ds)
    except Exception:
        url = None

    # Debug: show what URL was built (or None)
    try:
        print('DEBUG built sqlalchemy url:', url)
    except Exception:
        pass

    if not url:
        # Provide more specific validation feedback instead of generic message
        required = []
        missing = []
        db_type = getattr(ds, 'db_type', None)
        if db_type in ('postgres','mysql'):
            required = ['host','database','user']  # password optional for local trust setups but include for clarity
        elif db_type == 'sqlite':
            required = ['database']
        else:
            return Response({'ok': False, 'error': 'unsupported db_type'}, status=status.HTTP_400_BAD_REQUEST)

        for f in required:
            val = getattr(ds, f, None)
            if val is None or (isinstance(val, str) and val.strip() == ''):
                missing.append(f)
        if missing:
            return Response({'ok': False, 'error': 'missing required fields', 'missing': missing}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'ok': False, 'error': 'incomplete datasource configuration'}, status=status.HTTP_400_BAD_REQUEST)

    if 'sqlalchemy' not in globals() and 'create_engine' not in globals():
        # create_engine imported at module top; but if SQLAlchemy missing return informative error
        pass

    try:
        engine = create_engine(url)
        # Attempt simple connection
        with engine.connect() as conn:
            # Run a trivial query depending on dialect using SQLAlchemy 2.x API
            try:
                conn.exec_driver_sql('SELECT 1')
            except AttributeError:
                # fallback for older SQLAlchemy
                conn.execute('SELECT 1')
        return Response({'ok': True})
    except SQLAlchemyError as e:
        # Log traceback for debugging
        try:
            print('DEBUG sqlalchemy error:')
            traceback.print_exc()
        except Exception:
            pass
        return Response({'ok': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        try:
            print('DEBUG datasource_test unexpected error:')
            traceback.print_exc()
        except Exception:
            pass
        return Response({'ok': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DataSetViewSet(viewsets.ModelViewSet):
    queryset = DataSet.objects.all().order_by('-created_at')
    serializer_class = DataSetSerializer


class DataSourceViewSet(viewsets.ModelViewSet):
    """CRUD viewset exposing DataSource records."""
    queryset = DataSource.objects.all().order_by('-created_at')
    from .serializers import DataSourceSerializer
    serializer_class = DataSourceSerializer

    def create(self, request, *args, **kwargs):
        # Temporary debug: print incoming payload to server console to diagnose missing fields
        try:
            print('DEBUG DataSource.create payload:', request.data)
            # If request.data is empty or missing expected keys, also print raw body and content type
            try:
                ct = request.META.get('CONTENT_TYPE')
                print('DEBUG Content-Type:', ct)
                raw = request.body
                if raw:
                    try:
                        print('DEBUG raw body:', raw.decode('utf-8'))
                    except Exception:
                        print('DEBUG raw body (binary):', raw[:200])
            except Exception:
                pass
        except Exception:
            pass
        return super().create(request, *args, **kwargs)


@api_view(['GET','POST'])
def dataset_preview(request):
    """Preview dataset rows. Accepts either:
    - GET?dataset=<dataset_id>
    - POST with { datasource: <id or payload>, table: <table>, sql: <sql>, aggregation: {...}, limit }

    Returns { columns: [...], rows: [...] } or error.
    """
    data = request.data if request.method == 'POST' else request.query_params
    # Debug incoming payload
    try:
        print('DEBUG dataset_preview payload:', data)
        print('DEBUG Content-Type:', request.META.get('CONTENT_TYPE'))
        raw = request.body
        if raw:
            try:
                print('DEBUG raw body:', raw.decode('utf-8'))
            except Exception:
                print('DEBUG raw body (binary):', raw[:200])
    except Exception:
        pass

    # parse common params early
    limit = int(data.get('limit') or 200)
    aggregation = None
    try:
        if data.get('aggregation'):
            import json
            aggregation = json.loads(data.get('aggregation')) if isinstance(data.get('aggregation'), str) else data.get('aggregation')
    except Exception:
        aggregation = None

    dataset_id = data.get('dataset')
    if dataset_id:
        try:
            ds_obj = DataSet.objects.filter(id=dataset_id).first()
            # Debug dataset object
            try:
                print('DEBUG dataset obj:', {'id': str(ds_obj.id) if ds_obj else None, 'name': getattr(ds_obj, 'name', None), 'datasource': getattr(ds_obj, 'datasource', None), 'query': getattr(ds_obj, 'query', None)})
            except Exception:
                pass
            if ds_obj:
                # If dataset has an in-memory payload, return that first
                if ds_obj.datasource:
                    q = ds_obj.query or ''
                    try:
                        ds_instance = ds_obj.datasource
                        # debug built url for dataset datasource
                        try:
                            from .datasource_adapters import build_sqlalchemy_url
                            print('DEBUG dataset datasource url:', build_sqlalchemy_url(ds_instance))
                        except Exception:
                            pass
                        # Run the stored query as-is (raw SQL) per user's request to prioritize functionality
                        if q and q.strip() != '':
                            result = run_query(ds_instance, sql=q, limit=limit, aggregation=aggregation, allow_raw=True)
                            return Response(result)
                        else:
                            # If no stored query, fall back to table preview behavior (handled below)
                            pass
                    except Exception as e:
                        try:
                            print('DEBUG dataset_preview error:')
                            traceback.print_exc()
                        except Exception:
                            pass
                        return Response({'error': str(e)}, status=400)
        except Exception:
            pass

    # Otherwise attempt SQL datasource query
    datasource = data.get('datasource') or data.get('datasource_id')
    table = data.get('table')
    sql = data.get('sql')
    limit = int(data.get('limit') or 200)
    aggregation = None
    try:
        if data.get('aggregation'):
            import json
            aggregation = json.loads(data.get('aggregation')) if isinstance(data.get('aggregation'), str) else data.get('aggregation')
    except Exception:
        aggregation = None

    # Resolve datasource instance if given by id
    ds_instance = None
    if datasource:
        try:
            ds_instance = DataSource.objects.filter(id=datasource).first()
        except Exception:
            ds_instance = None

    # If datasource instance not found but POST contains connection details, build a temp object
    if not ds_instance and request.method == 'POST':
        payload = request.data
        if isinstance(payload, dict) and payload.get('db_type'):
            class TempDS: pass
            ds_instance = TempDS()
            ds_instance.db_type = payload.get('db_type')
            ds_instance.user = payload.get('user')
            ds_instance.password = payload.get('password')
            ds_instance.host = payload.get('host')
            # Coerce port similar to datasource_test
            p = payload.get('port')
            if p is None or (isinstance(p, str) and p.strip() == ''):
                ds_instance.port = None
            else:
                try:
                    ds_instance.port = int(p)
                except Exception:
                    ds_instance.port = p
            ds_instance.database = payload.get('database')

    try:
        # allow raw SQL for ad-hoc previews as well (developer mode)
        result = run_query(ds_instance, table=table, sql=sql, limit=limit, aggregation=aggregation, allow_raw=True)
        return Response(result)
    except Exception as e:
        return Response({'error': str(e)}, status=400)


@api_view(['GET'])
def dataset_fields(request):
    """Return column names/types for a saved DataSet id passed as ?dataset=<id>
    Falls back to DataSet.payload (if present) or attempts to run the stored query with limit=1 to retrieve column names.
    Response: { columns: [ { name: 'col', type: 'string' }, ... ] }
    """
    dataset_id = request.query_params.get('dataset')
    if not dataset_id:
        return Response({'error': 'dataset id required'}, status=400)
    try:
        ds_obj = DataSet.objects.filter(id=dataset_id).first()
        if not ds_obj:
            return Response({'error': 'dataset not found'}, status=404)

        # If payload exists and is structured, derive columns from it
        if getattr(ds_obj, 'payload', None):
            p = ds_obj.payload
            if isinstance(p, list) and len(p) > 0 and isinstance(p[0], dict):
                cols = [{ 'name': k, 'type': 'string' } for k in p[0].keys()]
                return Response({'columns': cols})
            if isinstance(p, dict):
                cols = [{ 'name': k, 'type': 'string' } for k in p.keys()]
                return Response({'columns': cols})

        # If dataset has a datasource and stored query, try to execute it with limit=1 to get column names
        if ds_obj.datasource and getattr(ds_obj, 'query', None):
            try:
                res = run_query(ds_obj.datasource, sql=ds_obj.query, limit=1, allow_raw=True)
                cols = [{ 'name': c, 'type': 'string' } for c in (res.get('columns') or [])]
                return Response({'columns': cols})
            except Exception:
                pass

        # Fallback: return empty list
        return Response({'columns': []})
    except Exception:
        traceback.print_exc()
        return Response({'error': 'internal error'}, status=500)


@api_view(['POST'])
def query_preview(request):
    """Run an arbitrary SQL preview against a datasource or connection payload.
    POST body: { datasource: <id or payload>, sql: '<sql>' }
    Returns: { columns: [...], rows: [...] }
    """
    payload = request.data or {}
    datasource = payload.get('datasource')
    sql = payload.get('sql')
    limit = int(payload.get('limit') or 200)
    # New optional params for automatic time injection
    time_range = payload.get('time_range')  # expected { from: 'ISO', to: 'ISO' }
    time_field = payload.get('time_field') or payload.get('timestamp_field') or 'time'
    try:
        print('DEBUG query_preview payload time_range=', time_range, 'time_field=', time_field)
    except Exception:
        pass

    ds_instance = None
    # if datasource is an id, load DataSource
    if isinstance(datasource, str):
        try:
            ds_instance = DataSource.objects.filter(id=datasource).first()
        except Exception:
            ds_instance = None

    # if not found and payload contains connection info, build temp ds
    if not ds_instance and isinstance(datasource, dict):
        class TempDS: pass
        ds_instance = TempDS()
        ds_instance.db_type = datasource.get('db_type')
        ds_instance.user = datasource.get('user')
        ds_instance.password = datasource.get('password')
        ds_instance.host = datasource.get('host')
        p = datasource.get('port')
        if p is None or (isinstance(p, str) and p.strip()==''):
            ds_instance.port = None
        else:
            try:
                ds_instance.port = int(p)
            except Exception:
                ds_instance.port = p
        ds_instance.database = datasource.get('database')

    if not ds_instance:
        return Response({'error': 'datasource required'}, status=400)
    if not sql or not isinstance(sql, str):
        return Response({'error': 'sql required'}, status=400)

    # If time_range provided, inject a parameterized WHERE clause safely.
    params = {}
    final_sql = sql
    if time_range and isinstance(time_range, dict) and time_range.get('from') and time_range.get('to'):
        # Validate time_field to avoid SQL injection via field name.
        safe_field = str(time_field or '').strip()
        # allow names like "table.column" and simple identifiers starting with letter/_ followed by letters, numbers, _ or .
        if not re.match(r'^[A-Za-z_][A-Za-z0-9_.]*$', safe_field):
            return Response({'error': 'invalid time_field name'}, status=400)

        # Use parameter names unlikely to collide
        params['__from'] = time_range.get('from')
        params['__to'] = time_range.get('to')

        # For robustness with complex SQL (subqueries, unions, etc.) wrap the original SQL as an outer subquery
        # Strip any trailing semicolons to avoid syntax issues
        stripped = final_sql.strip()
        if stripped.endswith(';'):
            stripped = stripped[:-1]

        # Build outer query that filters on the time field inside the subquery
        # Use alias __t and qualify the field as __t.<field>
        # Note: do not add a LIMIT here; let run_query handle 'limit' parameter if supported by adapter
        final_sql = f"SELECT * FROM ({stripped}) AS __t WHERE __t.{safe_field} >= :__from AND __t.{safe_field} <= :__to"

    try:
        res = run_query(ds_instance, sql=final_sql, params=params or None, limit=limit, allow_raw=True)
        return Response(res)
    except Exception as e:
        try:
            traceback.print_exc()
        except Exception:
            pass
        return Response({'error': str(e)}, status=400)
    
@api_view(['POST'])
def test_es_connection(request):
    """Server-side proxy to test connectivity to an Elasticsearch host.
    POST body: { host: 'http://...', username: 'user', password: 'pass', path: '/_cluster/health' }
    Returns: { ok: true, status: 200, body: '...', headers: { ... } } or error details.
    """
    payload = request.data or {}
    host = payload.get('host')
    if not host:
        return Response({'ok': False, 'error': 'host required'}, status=status.HTTP_400_BAD_REQUEST)
    path = payload.get('path') or '/_cluster/health'
    url = host.rstrip('/') + path
    auth = None
    username = payload.get('username')
    password = payload.get('password')
    if username:
        auth = HTTPBasicAuth(username, password or '')
    try:
        resp = requests.get(url, timeout=10, auth=auth)
    except requests.exceptions.RequestException as e:
        return Response({'ok': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    body = None
    try:
        body = resp.text
    except Exception:
        body = None
    headers = dict(resp.headers)
    return Response({'ok': True, 'status': resp.status_code, 'body': body, 'headers': headers})


@api_view(['POST'])
def test_logstash_connection(request):
    """Test connectivity to a Logstash HTTP endpoint (or generic host).
    POST body: { host: 'http://...', path: '/' }
    """
    payload = request.data or {}
    host = payload.get('host')
    if not host:
        return Response({'ok': False, 'error': 'host required'}, status=status.HTTP_400_BAD_REQUEST)
    path = payload.get('path') or '/'
    url = host.rstrip('/') + path
    try:
        resp = requests.get(url, timeout=10)
    except requests.exceptions.RequestException as e:
        return Response({'ok': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    body = None
    try:
        body = resp.text
    except Exception:
        body = None
    return Response({'ok': True, 'status': resp.status_code, 'body': body, 'headers': dict(resp.headers)})


@api_view(['POST'])
def test_airflow_connection(request):
    """Test connectivity to an Airflow instance using the health endpoint or provided path.
    POST body: { host: 'http://...', username, password, path: '/api/v1/health' }
    """
    payload = request.data or {}
    host = payload.get('host')
    if not host:
        return Response({'ok': False, 'error': 'host required'}, status=status.HTTP_400_BAD_REQUEST)
    path = payload.get('path') or '/api/v1/health'
    url = host.rstrip('/') + path
    auth = None
    username = payload.get('username')
    password = payload.get('password')
    headers = {}
    token = payload.get('token')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if username:
        auth = HTTPBasicAuth(username, password or '')
    try:
        resp = requests.get(url, timeout=10, auth=auth, headers=headers)
    except requests.exceptions.RequestException as e:
        return Response({'ok': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    body = None
    try:
        body = resp.text
    except Exception:
        body = None
    return Response({'ok': True, 'status': resp.status_code, 'body': body, 'headers': dict(resp.headers)})
