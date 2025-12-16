try:
    from sqlalchemy import create_engine, inspect, text
    from sqlalchemy.exc import SQLAlchemyError
    _HAS_SQLALCHEMY = True
except Exception:
    _HAS_SQLALCHEMY = False

# Adapter that uses SQLAlchemy to inspect table columns for various DB types.
# Connection string examples:
# postgres: postgresql+psycopg2://user:pass@host:port/dbname
# mysql: mysql+pymysql://user:pass@host:port/dbname
# sqlite: sqlite:///path/to/db.sqlite3

# -----------------------------
# 中文注释：
# 本模块为数据源适配器，封装了使用 SQLAlchemy 对外部数据库进行：
# - 构建 SQLAlchemy URL（build_sqlalchemy_url）
# - 列出表字段（list_table_columns）
# - 运行查询并返回列/行预览（run_query），支持聚合、原始 SQL 和基于表的预览
#
# 该模块在运行时依赖 SQLAlchemy；当环境中未安装 SQLAlchemy 时会退化并抛出或返回 None，调用方需自行处理。
# 本次修改仅添加注释，不改动实现逻辑。
# -----------------------------

def build_sqlalchemy_url(ds):
    # Defensive: accept objects where attributes may be missing or strings
    db_type = getattr(ds, 'db_type', None)
    user = getattr(ds, 'user', '') or ''
    password = getattr(ds, 'password', '') or ''
    host = getattr(ds, 'host', '') or ''
    port = getattr(ds, 'port', None)
    database = getattr(ds, 'database', '') or ''

    # Normalize port: if empty string or None, omit it; try to cast to int otherwise
    port_str = ''
    if port is not None and str(port).strip() != '':
        try:
            p_int = int(str(port))
            port_str = f":{p_int}"
        except Exception:
            # If it's not parseable, omit the port to avoid SQLAlchemy ValueError
            port_str = ''

    # Helper to build netloc and avoid stray ':' when user/password missing
    def _build_netloc(user, password, host, port_str):
        creds = ''
        if user:
            creds = user
            if password:
                creds = f"{creds}:{password}"
            creds = f"{creds}@"

        host_part = ''
        if host:
            host_part = f"{host}{port_str}"
        elif port_str:
            # port without host is invalid — ignore port
            host_part = ''

        netloc = f"{creds}{host_part}"
        return netloc

    if db_type == 'postgres':
        # If no meaningful connection info provided, return None so caller can handle it
        if not (user or password or host or database):
            return None
        netloc = _build_netloc(user, password, host, port_str)
        if netloc:
            # db may be empty
            return f'postgresql+psycopg2://{netloc}{"/" + database if database else ""}'
        else:
            # No netloc, but maybe a local DB file/name provided
            return f'postgresql+psycopg2:///{database}' if database else None
    if db_type == 'mysql':
        if not (user or password or host or database):
            return None
        netloc = _build_netloc(user, password, host, port_str)
        if netloc:
            return f'mysql+pymysql://{netloc}{"/" + database if database else ""}'
        else:
            return f'mysql+pymysql:///{database}' if database else None
    if db_type == 'sqlite':
        # for sqlite, database may be a file path
        return f'sqlite:///{database}'
    return None


def list_table_columns(ds, table_name):
    url = build_sqlalchemy_url(ds)
    if not url:
        return None
    try:
        if not _HAS_SQLALCHEMY:
            return None
        engine = create_engine(url, connect_args={})
        insp = inspect(engine)
        if not insp.has_table(table_name):
            return None
        cols = insp.get_columns(table_name)
        result = []
        for c in cols:
            result.append({'name': c.get('name'), 'type': str(c.get('type'))})
        return result
    except SQLAlchemyError:
        return None


def run_query(ds, *, table=None, sql=None, params=None, limit=200, aggregation=None, allow_raw=False):
    """Run a query against the datasource.

    - ds: DataSource instance or object with db_type/user/password/host/port/database
    - table: optional table name to SELECT from (preferred)
    - sql: optional raw SQL string (only executed if allow_raw True)
    - params: optional params dict for parameterized queries
    - limit: integer limit for number of rows returned
    - aggregation: optional dict { group_by: [cols], aggregates: {name: {op: 'sum', column: 'col'}} }

    Returns a dict: { columns: [...], rows: [ ... ] } or raises SQLAlchemyError/Exception
    """
    if not _HAS_SQLALCHEMY:
        raise RuntimeError('SQLAlchemy not available')

    url = build_sqlalchemy_url(ds)
    if not url:
        raise RuntimeError('Unsupported datasource')

    engine = create_engine(url)

    # If aggregation requested and table provided, build an aggregation SQL
    if aggregation and table:
        group_by = aggregation.get('group_by', []) or []
        aggregates = aggregation.get('aggregates', {}) or {}
        agg_parts = []
        for alias, spec in aggregates.items():
            op = spec.get('op', 'sum').upper()
            col = spec.get('column')
            if op not in ('SUM','AVG','MIN','MAX','COUNT'):
                raise ValueError('unsupported aggregate op')
            if op == 'COUNT' and (not col):
                agg_parts.append(f'COUNT(*) AS {alias}')
            else:
                agg_parts.append(f"{op}({col}) AS {alias}")

        select_cols = ', '.join(group_by + agg_parts) if (group_by or agg_parts) else '*'
        group_clause = f" GROUP BY {', '.join(group_by)}" if group_by else ''
        sql_text = f"SELECT {select_cols} FROM {table}{group_clause} LIMIT {int(limit)}"
        with engine.connect() as conn:
            res = conn.exec_driver_sql(sql_text)
            cols = [c[0] for c in res.cursor.description] if getattr(res, 'cursor', None) else []
            rows = [list(r) for r in res]
            return {'columns': cols, 'rows': rows}

    # If raw SQL provided
    if sql:
        if not allow_raw:
            raise RuntimeError('raw SQL execution disabled')
        with engine.connect() as conn:
            # If params provided, prefer SQLAlchemy text() which will compile named binds
            # to the correct DBAPI param style (e.g. psycopg2 expects %(name)s).
            if params:
                res = conn.execute(text(sql), params)
            else:
                # exec_driver_sql can be used for simple non-parameterized SQL
                try:
                    res = conn.exec_driver_sql(sql)
                except Exception:
                    # Fallback to execute(text(sql)) for broader compatibility
                    res = conn.execute(text(sql))

            # Extract column names in a SQLAlchemy-version-agnostic way
            cols = []
            try:
                if hasattr(res, 'keys'):
                    cols = list(res.keys())
                elif getattr(res, 'cursor', None):
                    cols = [c[0] for c in res.cursor.description]
            except Exception:
                cols = []

            rows = [list(r) for r in res]
            return {'columns': cols, 'rows': rows}

    # Fallback: select from table
    if table:
        # Prefer selecting a limited set of explicit columns rather than SELECT * for safety and performance.
        try:
            insp = inspect(engine)
            cols_meta = insp.get_columns(table)
            cols = [c.get('name') for c in cols_meta]
        except Exception:
            cols = []

        if not cols:
            # Try a DB-specific fallback (Postgres) to get column names from information_schema
            try:
                if getattr(ds, 'db_type', '') == 'postgres':
                    with engine.connect() as conn:
                        q = "SELECT column_name FROM information_schema.columns WHERE table_name = :t ORDER BY ordinal_position LIMIT 100"
                        res = conn.exec_driver_sql(q, {'t': table})
                        cols = [r[0] for r in res]
            except Exception:
                pass

            if not cols:
                # Fallback to SELECT * if we cannot introspect
                sql_text = f"SELECT * FROM {table} LIMIT {int(limit)}"
            else:
                sel_cols = cols[:20]
                select_clause = ', '.join(sel_cols)
                sql_text = f"SELECT {select_clause} FROM {table} LIMIT {int(limit)}"
        else:
            # choose a reasonable subset of columns to preview
            sel_cols = cols[:20]
            select_clause = ', '.join(sel_cols)
            sql_text = f"SELECT {select_clause} FROM {table} LIMIT {int(limit)}"

        with engine.connect() as conn:
            res = conn.exec_driver_sql(sql_text)
            cols = [c[0] for c in res.cursor.description] if getattr(res, 'cursor', None) else []
            rows = [list(r) for r in res]
            return {'columns': cols, 'rows': rows}

    raise RuntimeError('no table or sql provided')