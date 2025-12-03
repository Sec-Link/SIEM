import React, { useEffect, useState } from 'react'
import { Card, Button, List, Modal, Form, Input, Select, message, InputNumber, DatePicker } from 'antd'
import axios, { previewEsIntegration, integrationsDbTables, integrationsCreateTable, integrationsCreateTableFromEs, integrationsPreviewEsMapping } from '../api'

// 文件级中文说明：
// 本文件实现 Orchestrator 页面，用于管理定时任务（Task），支持：
// - 新建/编辑/列出任务（包含 schedule、source/dest integration、index、limit、query 等）
// - 手动触发任务运行并查看运行日志
// - 任务的时间范围选择支持绝对时间与相对时间（包含预设和自定义相对）
// 设计要点：
// - computeTsRange 用于把表单中混合的绝对/相对时间选择归一化为 ES 可用的 ISO 时间范围（或 'now'）
// - 保存任务时会把时间选择转换并把一个 ES range 查询附加到任务 config 中，以便运行时复用相同的过滤条件
// - 前端不改变后端数据模型，仅负责将表单字段组织为后端期望的 payload

export default function Orchestrator(){
  const [items, setItems] = useState<any[]>([])
  const [integrations, setIntegrations] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<any | null>(null)
  const [form] = Form.useForm()
  const [runsModalTask, setRunsModalTask] = useState<any | null>(null)
  const [availableTables, setAvailableTables] = useState<string[]>([])
  const [showCreateTableModal, setShowCreateTableModal] = useState(false)
  const [creatingTableName, setCreatingTableName] = useState('es_imports')
  const [previewColumns, setPreviewColumns] = useState<any[] | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [editedColumns, setEditedColumns] = useState<any[] | null>(null)
  const PG_TYPE_OPTIONS = ['text','integer','bigint','smallint','real','double precision','numeric','boolean','timestamptz','timestamp','date','jsonb','json']
  const MYSQL_TYPE_OPTIONS = ['TEXT','INT','BIGINT','SMALLINT','DOUBLE','TINYINT(1)','DATETIME','JSON','VARCHAR(255)']

  // compute ISO timestamps for lower and upper bounds based on absolute or relative selectors
  // 说明：将表单中混合的绝对/相对时间选择解析为 ES 可接受的范围
  // 输入 vals（表单值）可能包含：timestamp_from, timestamp_to, timestamp_relative, timestamp_relative_custom_value/unit 等
  // 输出：{ from: ISOString|null, to: ISOString|'now'|null }
  const computeTsRange = (vals: any): { from: string | null, to: string | null } => {
    let tsFrom: string | null = null
    let tsTo: string | null = null

    // absolute timestamps (single or range)
    if(vals.timestamp_from){
      try{
        if(typeof vals.timestamp_from === 'string') tsFrom = vals.timestamp_from
        else if(typeof vals.timestamp_from.toISOString === 'function') tsFrom = vals.timestamp_from.toISOString()
        else if(vals.timestamp_from instanceof Date) tsFrom = vals.timestamp_from.toISOString()
        else tsFrom = String(vals.timestamp_from)
      }catch(e){ tsFrom = null }
    }
    if(vals.timestamp_to){
      try{
        if(typeof vals.timestamp_to === 'string') tsTo = vals.timestamp_to
        else if(typeof vals.timestamp_to.toISOString === 'function') tsTo = vals.timestamp_to.toISOString()
        else if(vals.timestamp_to instanceof Date) tsTo = vals.timestamp_to.toISOString()
        else tsTo = String(vals.timestamp_to)
      }catch(e){ tsTo = null }
    }

    // if no absolute from, consider relative
    if(!tsFrom){
      // prefer explicit timestamp_relative, fallback to time_selector (which may be 'custom_relative')
      const rel = vals.timestamp_relative || vals.time_selector
      if(rel){
        let value: number | null = null
        let unit: string | null = null
        if(typeof rel === 'string'){
          if(rel === 'custom' || rel === 'custom_relative'){
            if(vals.timestamp_relative_custom_value && vals.timestamp_relative_custom_unit){
              value = Number(vals.timestamp_relative_custom_value)
              unit = vals.timestamp_relative_custom_unit
            }
          }else{
            const m = rel.match(/^(\d+)([mhd])$/)
            if(m){ value = Number(m[1]); unit = m[2] }
          }
        }else if(typeof rel === 'object' && rel !== null){
          value = Number(rel.value)
          unit = rel.unit
        }

        // 如果解析出了相对时间的 value 与 unit，则构造 ES 相对时间字符串 like 'now-10h', to='now'
        if(value && unit){
          tsFrom = `now-${value}${unit}`
          tsTo = 'now'
        }
      }
    }

    // 说明：若计算出 tsFrom 且未指定 tsTo，则默认 tsTo='now'，这样构造出的范围可以直接用于 ES 的 range.gte/lte
    if(tsFrom && !tsTo) tsTo = 'now'
    return { from: tsFrom, to: tsTo }
  }

  const fetch = async ()=>{
    try{ const res = await axios.get('/tasks/'); setItems(res.data) }catch(e){ setItems([]) }
  }

  const fetchIntegrations = async ()=>{
    try{ const r = await axios.get('/integrations/'); setIntegrations(r.data) }catch(e){ setIntegrations([]) }
  }

  useEffect(()=>{ fetch() }, [])

  useEffect(()=>{ fetchIntegrations() }, [])
  useEffect(()=>{ fetchRuns() }, [])

  const save = async ()=>{
    const v = await form.validateFields()
    // build payload expected by backend: { name, schedule, config }
  // 说明：构造提交到后端的 task payload。后端期望字段示例：{ name, schedule, task_type, config }
  // config 中包含 sync 类型、source/dest integration、index、limit、query 以及时间筛选相关字段
  const payload: any = { name: v.name, schedule: v.schedule, task_type: 'es_to_db', config: {} }
    // assemble sync config
    payload.config.sync = 'es_to_db'
    payload.config.source_integration = v.source_integration
    payload.config.dest_integration = v.dest_integration
    if(v.table) payload.config.table = v.table
    payload.config.index = v.index
    payload.config.limit = Number(v.limit) || 1000
    // if user supplied a JSON query in config textarea, try parse it
    if(v.config){
      if(typeof v.config === 'string'){
        try{ payload.config.query = JSON.parse(v.config) }catch(e){ /* ignore invalid JSON for query */ }
      }else if(typeof v.config === 'object'){
        payload.config = { ...payload.config, ...v.config }
      }
    }
    // include timestamp selection into config
    if(v.timestamp_field) payload.config.timestamp_field = v.timestamp_field
    if(v.timestamp_from){
      if(typeof v.timestamp_from === 'string') payload.config.timestamp_from = v.timestamp_from
      else if(v.timestamp_from.toISOString) payload.config.timestamp_from = v.timestamp_from.toISOString()
    }
    // persist absolute upper bound if provided
    if(v.timestamp_to){
      if(typeof v.timestamp_to === 'string') payload.config.timestamp_to = v.timestamp_to
      else if(v.timestamp_to.toISOString) payload.config.timestamp_to = v.timestamp_to.toISOString()
    }
    if(v.timestamp_relative){
      // store preset or custom
      if(v.timestamp_relative === 'custom'){
        payload.config.timestamp_relative = { value: v.timestamp_relative_custom_value, unit: v.timestamp_relative_custom_unit }
      }else{
        payload.config.timestamp_relative = v.timestamp_relative
      }
    }

    // compute and attach an ES range query so the task run will use the same filter
    const range = computeTsRange(v)
    // 如果用户指定了时间字段并且 computeTsRange 返回了起始时间，则把一个 ES range 查询写入 payload.config.query
    if(v.timestamp_field && range.from){
      payload.config.query = { query: { range: { [v.timestamp_field]: { gte: range.from, lte: range.to || 'now' } } } }
    }

    try{
      if(editingTask){
        // update existing task
        await axios.put(`/tasks/${editingTask.id}/`, payload)
        message.success('Task updated')
      }else{
        await axios.post('/tasks/', payload)
        message.success('Task created')
      }
      setShowModal(false)
      setEditingTask(null)
      fetch()
      fetchRuns()
    }catch(e:any){ message.error(String(e)) }
  }

  const fetchTablesFromIntegration = async () => {
    try{
      const v = form.getFieldsValue()
      if(!v.dest_integration) return
      const payload: any = { integration: v.dest_integration }
      const res = await integrationsDbTables(payload)
      if(res && res.tables) setAvailableTables(res.tables)
      else setAvailableTables([])
    }catch(e:any){ message.warning('Could not fetch tables: ' + (e.message || String(e))) }
  }

  const handleCreateTable = async () => {
    try{
      const v = form.getFieldsValue()
      const payload: any = { table: creatingTableName }
      if(v.dest_integration) payload.integration = v.dest_integration
      const res = await integrationsCreateTable(payload)
      if(res && res.ok){
        message.success('Table created: ' + res.table)
        try{ await fetchTablesFromIntegration() }catch(_){ }
        form.setFieldsValue({ table: res.table })
        setShowCreateTableModal(false)
      }else{
        message.error('Create table failed: ' + JSON.stringify(res))
      }
    }catch(e:any){ message.error(String(e)) }
  }

  const createTableFromEs = async (esIntegrationId?: string, indexName?: string) => {
    try{
      const v = form.getFieldsValue()
      // default to New Task form values if args not provided
      if(!esIntegrationId) esIntegrationId = v.source_integration
      if(!indexName) indexName = v.index
      const payload: any = { table: creatingTableName }
      if(esIntegrationId) payload.es_integration = esIntegrationId
      if(indexName) payload.index = indexName
      if(v.dest_integration) payload.dest_integration = v.dest_integration
      payload.save_to_file = true
      if(editedColumns && editedColumns.length > 0){ payload.columns = editedColumns.map((c:any)=>({ orig_name: c.orig_name, colname: c.colname, sql_type: c.sql_type })) }
      const res = await integrationsCreateTableFromEs(payload)
      if(res && res.ok){
        if(res.saved_path) message.success('Mapping saved to: ' + res.saved_path)
        message.success('Table created from ES mapping: ' + res.table)
        try{ await fetchTablesFromIntegration() }catch(_){ }
        form.setFieldsValue({ table: res.table })
        if(res.columns && res.columns.length){ setEditedColumns(res.columns) }
        setShowCreateTableModal(false)
      }else{
        message.error('Create table failed: ' + JSON.stringify(res))
      }
    }catch(e:any){ message.error(String(e)) }
  }

  const fetchRuns = async ()=>{
    try{
      const r = await axios.get('/task_runs/')
      setRuns(r.data || [])
    }catch(e){ setRuns([]) }
  }

  const runTask = async (taskId: string) => {
    try{
      const r = await axios.post(`/tasks/${taskId}/run/`)
  const run = r.data
  // 说明：后端返回的 run 对象包含 id, status, logs 等字段；这里用 Modal 展示运行日志和状态
  Modal.info({ title: `Task run ${run.id} - ${run.status}`, width: 800, content: (<pre style={{ whiteSpace: 'pre-wrap' }}>{run.logs}</pre>) })
      fetch()
      fetchRuns()
    }catch(e:any){
      const detail = e.response && e.response.data ? JSON.stringify(e.response.data) : String(e)
      Modal.error({ title: 'Run failed', content: detail })
    }
  }

  const openRunsForTask = (task:any) => {
    setRunsModalTask(task)
    // ensure latest runs
    fetchRuns()
  }

  const closeRunsModal = ()=> setRunsModalTask(null)

  return (
    <div style={{ padding: 12 }}>
      <Card title="Orchestrator">
        <Button type="primary" onClick={()=>setShowModal(true)} style={{ marginBottom: 12 }}>New Task</Button>
        <List dataSource={items} renderItem={(it:any)=>(
          <List.Item actions={[
            <Button key="run" onClick={()=>runTask(it.id)}>Run</Button>,
            <Button key="runs" onClick={()=>openRunsForTask(it)}>View Runs</Button>
          ]}>
            <List.Item.Meta title={<a onClick={()=>{
              // open modal for editing
              setEditingTask(it)
              // set form fields from task
              const cfg = it.config || {}
              const initial: any = { name: it.name, schedule: it.schedule }
              // fill fields used by form
              initial.source_integration = cfg.source_integration
              initial.dest_integration = cfg.dest_integration
              initial.index = cfg.index
              initial.limit = cfg.limit || 1000
              if(cfg.query) initial.config = typeof cfg.query === 'string' ? cfg.query : JSON.stringify(cfg.query, null, 2)
              if(cfg.timestamp_field) initial.timestamp_field = cfg.timestamp_field
              if(cfg.timestamp_from) initial.timestamp_from = cfg.timestamp_from
              if(cfg.timestamp_to) initial.timestamp_to = cfg.timestamp_to
              if(cfg.timestamp_relative) initial.timestamp_relative = cfg.timestamp_relative
              form.setFieldsValue(initial)
              setShowModal(true)
            }}>{it.name}</a>} description={<div>Type: {it.task_type} Schedule: {it.schedule}</div>} />
          </List.Item>
        )} />
      </Card>

      <Modal open={!!runsModalTask} onCancel={closeRunsModal} footer={null} title={runsModalTask ? `Runs for ${runsModalTask.name}` : 'Runs'}>
        <List dataSource={runs.filter(r => runsModalTask ? r.task === runsModalTask.id : true)} renderItem={(r:any)=>(
          <List.Item>
            <List.Item.Meta title={`Run ${r.id} - ${r.status}`} description={r.started_at ? `started: ${r.started_at}` : ''} />
            <Button onClick={()=>Modal.info({ title: `Run ${r.id} logs`, width: 800, content: (<pre style={{ whiteSpace: 'pre-wrap' }}>{r.logs}</pre>) })}>View Logs</Button>
          </List.Item>
        )} />
      </Modal>

      <Modal open={showCreateTableModal} title="Create table" onCancel={()=>setShowCreateTableModal(false)} footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={()=>setShowCreateTableModal(false)}>Cancel</Button>
              <Button onClick={async ()=>{
                try{
                  // use New Task form values for integration/index/time range
                  const v = form.getFieldsValue()
                  const es_integration = v.source_integration
                  const index_name = v.index
                  if(!es_integration || !index_name){ message.warning('Select ES integration and index to preview'); return }
                  const payload:any = { es_integration: es_integration, index: index_name }
                  if(v.dest_integration) payload.dest_integration = v.dest_integration
                  // build optional time range query from form
                  const range = computeTsRange(v)
                  if(v.timestamp_field && range.from){
                    // send a range query and request the latest single doc by sorting descending
                    payload.query = { "query": { "range": { [v.timestamp_field]: { "gte": range.from, "lte": range.to || 'now' } } } }
                    payload.sort = [ { [v.timestamp_field]: { order: 'desc' } } ]
                    payload.size = 1
                  } else {
                    // default: fetch latest single doc
                    if(v.timestamp_field){
                      payload.sort = [ { [v.timestamp_field]: { order: 'desc' } } ]
                    }
                    payload.size = 1
                  }
                  // request preview and ask backend to save file
                  const suggestedName = `preview_${es_integration || 'es'}_${(index_name || 'index')}.json`
                  payload.save_to_file = true
                  payload.filename = suggestedName
                  const res = await integrationsPreviewEsMapping(payload)
                  if(res && res.ok){
                    setPreviewColumns(res.columns || [])
                    setEditedColumns((res.columns || []).map((c:any)=> ({ ...c })))
                    setShowPreviewModal(true)
                    if(res.saved_path){ message.success('Preview saved to: ' + res.saved_path) }
                  }else{
                    message.error('Preview failed: ' + JSON.stringify(res))
                  }
                }catch(e:any){ message.error(String(e)) }
              }}>Preview Schema</Button>
              <Button onClick={async ()=>{ await createTableFromEs() }}>Create from ES mapping</Button>
          <Button type="primary" onClick={handleCreateTable}>Create</Button>
        </div>
      )}>
        <Form layout="vertical">
          <Form.Item label="Table name">
            <Input value={creatingTableName} onChange={e=>setCreatingTableName(e.target.value)} />
          </Form.Item>
          <Form.Item>
            <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Create from the ES index selected in the New Task form (Source Integration + Index + Time range).</div>
          </Form.Item>
          <div style={{ fontSize: 12, color: '#666' }}>Creates a default table with columns: id, es_id, data, created_at (or more from mapping)</div>
        </Form>
      </Modal>

      <Modal open={showPreviewModal} title="Preview schema from ES mapping" onCancel={()=>{ setShowPreviewModal(false); setPreviewColumns(null) }} footer={null} width={700}>
        {editedColumns && editedColumns.length > 0 ? (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>Orig Name</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>Column</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>ES Type</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>SQL Type</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: 6 }}>Sample</th>
                </tr>
              </thead>
              <tbody>
                {editedColumns.map((c:any,i:number)=> (
                  <tr key={i}>
                    <td style={{ padding: 6, borderBottom: '1px solid #f6f6f6' }}>{c.orig_name}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f6f6f6' }}>
                      <Input value={c.colname} onChange={(e)=>{
                        const copy = editedColumns.slice(); copy[i] = { ...copy[i], colname: e.target.value }; setEditedColumns(copy)
                      }} />
                    </td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f6f6f6' }}>{String(c.es_type || '')}</td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f6f6f6' }}>
                      {(() => {
                        const targetType = form.getFieldValue('dest_integration')
                        const options = targetType === 'mysql' || targetType === 'mysql' ? MYSQL_TYPE_OPTIONS : PG_TYPE_OPTIONS
                        const value = c.sql_type || (options.length ? options[0] : '')
                        return (
                          <Select value={value} style={{ minWidth: 180 }} onChange={(val:any)=>{ const copy = editedColumns.slice(); copy[i] = { ...copy[i], sql_type: val }; setEditedColumns(copy) }}>
                            {options.map(op => (<Select.Option key={op} value={op}>{op}</Select.Option>))}
                          </Select>
                        )
                      })()}
                    </td>
                    <td style={{ padding: 6, borderBottom: '1px solid #f6f6f6' }}>{String(c.sample ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>No columns inferred from mapping.</div>
        )}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={()=>{ setShowPreviewModal(false) }}>Close</Button>
            <Button type="primary" onClick={()=>{
              setPreviewColumns(editedColumns)
              setShowPreviewModal(false)
            }}>Save Edits</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showModal} onCancel={()=>setShowModal(false)} onOk={save} title="New Task">
        <Form form={form} layout="vertical" initialValues={{ schedule: '0 0 * * *' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="schedule" label="Cron (e.g. 0 0 * * *)" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="source_integration" label="Source Integration (Elasticsearch)">
            <Select allowClear>
              {integrations.filter(i=>i.type==='elasticsearch').map(it => (<Select.Option key={it.id} value={it.id}>{it.name}</Select.Option>))}
            </Select>
          </Form.Item>
          <Form.Item label="Index (Elasticsearch)">
            <Input.Group compact>
              <Form.Item name="index" noStyle rules={[{ required: true }]}><Input style={{ width: '70%' }} /></Form.Item>
              <Button onClick={async ()=>{
                try{
                  const vals = form.getFieldsValue()
                  let q = null
                  // compute timestamp range from absolute or relative inputs
                  const range = computeTsRange(vals)
                  if(vals.timestamp_field && range.from){
                    q = { "query": { "range": { [vals.timestamp_field]: { "gte": range.from, "lte": range.to || 'now' } } } }
                  } else if(vals.timestamp_field){
                    // fallback: sometimes preset selection lives in time_selector or timestamp_relative
                    const sel = vals.time_selector || vals.timestamp_relative
                    let tsFrom: string | null = null
                    let tsTo: string | null = null
                    if(sel){
                      if(typeof sel === 'string'){
                        if(sel === 'custom' || sel === 'custom_relative' || sel === 'custom-relative'){
                          // read custom fields
                          if(vals.timestamp_relative_custom_value && vals.timestamp_relative_custom_unit){
                            tsFrom = `now-${vals.timestamp_relative_custom_value}${vals.timestamp_relative_custom_unit}`
                            tsTo = 'now'
                          }
                        }else{
                          const m = (''+sel).match(/^(\d+)([mhd])$/)
                          if(m){ tsFrom = `now-${m[1]}${m[2]}`; tsTo = 'now' }
                        }
                      }else if(typeof sel === 'object' && sel !== null){
                        if(sel.value && sel.unit){ tsFrom = `now-${sel.value}${sel.unit}`; tsTo = 'now' }
                      }
                    }
                    if(tsFrom){ q = { "query": { "range": { [vals.timestamp_field]: { "gte": tsFrom, "lte": tsTo || 'now' } } } } }
                  }
                  const res = await previewEsIntegration({ integration_id: vals.source_integration, index: vals.index, size: Number(vals.limit) || 10, query: q })
                  if(res.error) throw new Error(res.error)
                  Modal.info({ title: 'Data preview', width: 800, content: (<pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(res.rows, null, 2)}</pre>) })
                }catch(e:any){ message.error(String(e)) }
              }} style={{ marginLeft: 8 }}>Preview Data</Button>
            </Input.Group>
          </Form.Item>
          <Form.Item name="timestamp_field" label="Timestamp field (optional)"><Input placeholder="@timestamp or ts_field" /></Form.Item>

          <Form.Item name="time_selector" label="Time range">
            <Select
              onChange={(val:any)=>{
                // keep backward-compatible fields in sync: timestamp_relative or timestamp_from
                if(val === 'absolute'){
                  form.setFieldsValue({ timestamp_relative: undefined, timestamp_from: undefined, timestamp_to: undefined })
                }else if(val === 'custom_relative'){
                  // mark relative as 'custom' and clear absolute
                  form.setFieldsValue({ timestamp_from: undefined, timestamp_to: undefined, timestamp_relative: 'custom' })
                }else{
                  // preset: clear absolute and set preset string like '1h'
                  form.setFieldsValue({ timestamp_from: undefined, timestamp_to: undefined, timestamp_relative: val })
                }
                // time_selector itself is managed by the Form.Item binding; no need to set it here
              }}
            >
              <Select.Option value="1h">Last 1 hour</Select.Option>
              <Select.Option value="6h">Last 6 hours</Select.Option>
              <Select.Option value="24h">Last 24 hours</Select.Option>
              <Select.Option value="7d">Last 7 days</Select.Option>
              <Select.Option value="custom_relative">Custom relative</Select.Option>
              <Select.Option value="absolute">Absolute (pick a timestamp)</Select.Option>
            </Select>
          </Form.Item>

          {/* Render controls for absolute or custom relative depending on selection. The sub-controls write into the
              same form field names used elsewhere so computeTsFromIso continues to work. */}
          <Form.Item shouldUpdate noStyle>
            {()=>{
              const sel = form.getFieldValue('time_selector')
              if(sel === 'absolute'){
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Form.Item name="timestamp_from" label="From"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                    <Form.Item name="timestamp_to" label="To"><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
                  </div>
                )
              }
              if(sel === 'custom_relative'){
                return (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Form.Item name="timestamp_relative_custom_value" noStyle><InputNumber min={1} /></Form.Item>
                    <Form.Item name="timestamp_relative_custom_unit" noStyle><Select style={{ width: 120 }}>
                      <Select.Option value="m">minutes</Select.Option>
                      <Select.Option value="h">hours</Select.Option>
                      <Select.Option value="d">days</Select.Option>
                    </Select></Form.Item>
                  </div>
                )
              }
              // for presets or no selection render nothing (presets stored in timestamp_relative via onChange)
              return null
            }}
          </Form.Item>
          <Form.Item name="dest_integration" label="Destination Integration (Database)">
            <Select allowClear>
              {integrations.filter(i=>['postgresql','mysql'].includes(i.type)).map(it => (<Select.Option key={it.id} value={it.id}>{it.name}</Select.Option>))}
            </Select>
          </Form.Item>
          <Form.Item label="Destination table (optional)">
            <Input.Group compact>
              <Form.Item name="table" noStyle>
                <Select style={{ minWidth: 240 }} placeholder="Select existing table or leave empty">
                  {availableTables.map(tb => (<Select.Option key={tb} value={tb}>{tb}</Select.Option>))}
                </Select>
              </Form.Item>
              <Button onClick={()=>setShowCreateTableModal(true)}>Create table</Button>
              <Button onClick={()=>fetchTablesFromIntegration()} type="default">Refresh</Button>
            </Input.Group>
          </Form.Item>
          <Form.Item name="limit" label="Limit"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
