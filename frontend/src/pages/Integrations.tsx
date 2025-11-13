import React, { useEffect, useState } from 'react'
import { List, Button, Modal, Form, Input, Card, Space, Tag, message, Select, Divider } from 'antd'
import { integrationsDbTables, integrationsCreateTable, integrationsCreateTableFromEs, integrationsPreviewEsMapping } from '../api'
import { testEsIntegration, testLogstashIntegration, testAirflowIntegration, listIntegrations, createIntegration, updateIntegration, deleteIntegration, testDatasource } from '../api'
// 文件级中文说明：
// 本文件实现 Integrations 页面，负责显示/管理数据集成（Elasticsearch, Logstash, Airflow, PostgreSQL, MySQL）
// 关键功能包括：
// - 列表显示已有的 integrations
// - 新增/编辑 integration（表单）
// - 测试连接、刷新目标数据库表列表
// - 在创建表时支持根据 ES index mapping 预览并编辑列名、SQL 类型，然后从 mapping 创建表
// 前端注意点：
// - 编辑过的列名会暂存在 `editedColumns` 中；创建表成功后，若是新 integration，会把返回的 columns 存到 `pendingMapping`，
//   在保存 integration 时会一并写入到后端 integration.config.columns；若是编辑已有 integration 会尝试直接保存到该 integration 的 config。
// - 不在此处修改任何后端行为；本文件只负责 UI 层的数据收集和调用后端 API。
const Integrations: React.FC = () =>{
  const [items, setItems] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [form] = Form.useForm()
  const [availableTables, setAvailableTables] = useState<string[]>([])
  const [showCreateTableModal, setShowCreateTableModal] = useState(false)
  const [creatingTableName, setCreatingTableName] = useState('es_imports')
  const [modalEsIntegrationId, setModalEsIntegrationId] = useState<string | undefined>(undefined)
  const [modalIndexName, setModalIndexName] = useState<string | undefined>(undefined)
  const [previewColumns, setPreviewColumns] = useState<any[] | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [editedColumns, setEditedColumns] = useState<any[] | null>(null)
  const [pendingMapping, setPendingMapping] = useState<any[] | null>(null)
  const PG_TYPE_OPTIONS = ['text','integer','bigint','smallint','real','double precision','numeric','boolean','timestamptz','timestamp','date','jsonb','json']
  const MYSQL_TYPE_OPTIONS = ['TEXT','INT','BIGINT','SMALLINT','DOUBLE','TINYINT(1)','DATETIME','JSON','VARCHAR(255)']

  useEffect(()=>{ fetchList() }, [])

  const fetchList = async ()=>{
    try{ const r = await listIntegrations(); setItems(r) }catch(e){ setItems([]) }
  }

  const testIntegration = async (info: any) => {
    const type = info.type || 'elasticsearch'
    if(type === 'elasticsearch') return testEsIntegration(info)
    if(type === 'logstash') return testLogstashIntegration(info)
    if(type === 'airflow') return testAirflowIntegration(info)
    if(type === 'postgresql' || type === 'mysql'){
      const payload: any = { db_type: type === 'postgresql' ? 'postgres' : 'mysql' }
      payload.user = info.user || info.username || ''
      payload.password = info.password || ''
      payload.host = info.host || ''
      payload.port = info.port || ''
      payload.database = info.dbname || info.database || info.db || ''
      return testDatasource(payload)
    }
    throw new Error('Unsupported integration type')
  }

  // Build payload from current form values and call the backend to list tables
  // 说明：该函数从表单读取连接信息，构造后端期望的 payload（支持 conn_str 或 分段 host/user/password/...）
  // 返回：调用 `integrationsDbTables` 获得的表名列表并存入 `availableTables`。
  // 边界：如果非 DB 类型（非 postgresql/mysql），函数直接返回，不做请求。
  const fetchTablesFromForm = async () => {
    try{
      const v = form.getFieldsValue()
      if(!(v.type === 'postgresql' || v.type === 'mysql')) return
      const payload: any = { db_type: v.type === 'postgresql' ? 'postgres' : 'mysql' }
      if(v.conn_str) payload.conn_str = v.conn_str
      else{
        payload.host = v.host || ''
        payload.user = v.user || v.username || ''
        payload.password = v.password || ''
        payload.database = v.dbname || v.database || ''
        payload.port = v.port || ''
        payload.django_db = v.django_db || undefined
      }
      // if editing an existing integration, include its id so backend can use saved config
      if(editingIndex !== null){ payload.integration = items[editingIndex].id }
      const res = await integrationsDbTables(payload)
      if(res && res.tables) setAvailableTables(res.tables)
      else setAvailableTables([])
    }catch(e:any){
      // keep availableTables as-is but show a small warning
      message.warning('Could not fetch tables: ' + (e.message || String(e)))
    }
  }

  const save = async ()=>{
    const v = await form.validateFields()
    try{
      // 说明：收集表单值并构造 create/update integration 的 payload。
      // 若存在 pendingMapping（表示用户新建表时预览并编辑过 mapping），会把 mapping 写入 payload.config.columns
      const payload: any = { name: v.name, type: v.type, config: {} }
      if(v.type === 'elasticsearch'){
        payload.config = { host: v.host || '', username: v.username || '', password: v.password || '' }
      }else if(v.type === 'logstash'){
        payload.config = v.config || { inputs: [], filters: [], outputs: [] }
      }else if(v.type === 'airflow'){
        payload.config = { host: v.host || '', username: v.username || '', password: v.password || '', token: v.token || '', path: v.path || '' }
      }else if(v.type === 'postgresql' || v.type === 'mysql'){
        payload.config = {
          conn_str: v.conn_str || undefined,
          host: v.host || undefined,
          port: v.port || undefined,
          user: v.user || v.username || undefined,
          password: v.password || undefined,
          dbname: v.dbname || v.database || undefined,
          django_db: v.django_db || undefined,
          table: v.table || undefined,
        }
        // if user created a table from ES for a new integration, include pending mapping
        if(pendingMapping && pendingMapping.length){
          payload.config.columns = pendingMapping.map((c:any)=> ({ orig_name: c.orig_name, colname: c.colname, sql_type: c.sql_type }))
        }
      }else{
        payload.config = { ...(v.config || {}), host: v.host }
      }

      // 创建还是更新：editingIndex === null => 新建 integration，否则更新已有 integration
      if(editingIndex === null){
        await createIntegration(payload)
        message.success('Integration created')
      }else{
        const id = items[editingIndex].id
        await updateIntegration(id, payload)
        message.success('Integration updated')
      }
      setShowModal(false)
      setEditingIndex(null)
      form.resetFields()
      setPendingMapping(null)
      fetchList()
    }catch(e:any){ message.error(String(e)) }
  }

  const handleTestFromModal = async ()=>{
    try{
      const v = form.getFieldsValue()
      await testIntegration(v)
      message.success('Connection OK')
      if(v.type === 'postgresql' || v.type === 'mysql'){
        try{
          // fetch table list using helper so we keep logic consistent
          await fetchTablesFromForm()
        }catch(e:any){ message.warning('Could not fetch tables: ' + (e.message || String(e))) }
      }
    }catch(e:any){ message.error('Connection failed: ' + (e.message || String(e))) }
  }

  const openNew = ()=>{ setEditingIndex(null); form.resetFields(); setShowModal(true) }

  const openEdit = (it:any, idx:number)=>{
    setEditingIndex(idx)
    const copy = { ...it }
    if(!copy.config) copy.config = { inputs: [], filters: [], outputs: [] }
    const merged: any = { ...copy }
    if(copy.type === 'logstash') merged.config = copy.config
    else{
      merged.host = copy.config.host
      merged.username = copy.config.username
      merged.password = copy.config.password
      merged.token = copy.config.token
      merged.path = copy.config.path
      merged.conn_str = copy.config.conn_str || copy.config.url || undefined
      merged.port = copy.config.port || undefined
      merged.user = copy.config.user || copy.config.username || undefined
      merged.dbname = copy.config.dbname || copy.config.database || undefined
      merged.django_db = copy.config.django_db || undefined
      merged.table = copy.config.table || undefined
    }
    form.setFieldsValue(merged)
    setShowModal(true)
    // attempt to fetch tables for this integration right away
    setTimeout(()=>{ fetchTablesFromForm().catch(()=>{}) }, 50)
  }

  const handleCreateTable = async ()=>{
    try{
      const v = form.getFieldsValue()
      const payload: any = { table: creatingTableName }
      payload.db_type = v.type === 'postgresql' ? 'postgres' : 'mysql'
      if(v.conn_str) payload.conn_str = v.conn_str
      else{
        payload.host = v.host || ''
        payload.user = v.user || v.username || ''
        payload.password = v.password || ''
        payload.database = v.dbname || v.database || ''
        payload.port = v.port || ''
        payload.django_db = v.django_db || undefined
      }
      if(editingIndex !== null){ payload.integration = items[editingIndex].id }
      const res = await integrationsCreateTable(payload)
      if(res && res.ok){
        message.success('Table created: ' + res.table)
        try{
          const tablesRes = await integrationsDbTables(payload)
          if(tablesRes && tablesRes.tables) setAvailableTables(tablesRes.tables)
          form.setFieldsValue({ table: res.table })
        }catch(_){ }
        setShowCreateTableModal(false)
      }else{
        message.error('Create table failed: ' + JSON.stringify(res))
      }
    }catch(e:any){ message.error(String(e)) }
  }

  const createTableFromEs = async (esIntegrationId?: string, indexName?: string) => {
    try{
      const v = form.getFieldsValue()
      const payload: any = { table: creatingTableName }
      // include connection info as before
      payload.db_type = v.type === 'postgresql' ? 'postgres' : 'mysql'
      if(v.conn_str) payload.conn_str = v.conn_str
      else{
        payload.host = v.host || ''
        payload.user = v.user || v.username || ''
        payload.password = v.password || ''
        payload.database = v.dbname || v.database || ''
        payload.port = v.port || ''
        payload.django_db = v.django_db || undefined
      }
      if(esIntegrationId) payload.es_integration = esIntegrationId
      if(indexName) payload.index = indexName
      // include edited columns if the user previewed and edited them
      // 若用户在预览 modal 编辑了列名/类型，则把这些编辑后的列 metadata 发送给后端以便创建带列定义的表
      if(editedColumns && editedColumns.length > 0){
        payload.columns = editedColumns.map(c=>({ orig_name: c.orig_name, colname: c.colname, sql_type: c.sql_type }))
      }
      // if editing an existing (destination) integration, tell backend which integration to reuse
      if(editingIndex !== null){ payload.integration = items[editingIndex].id }
      const res = await integrationsCreateTableFromEs(payload)
      if(res && res.ok){
        message.success('Table created from ES mapping: ' + res.table)
        try{
          const tablesRes = await integrationsDbTables(payload)
          if(tablesRes && tablesRes.tables) setAvailableTables(tablesRes.tables)
          form.setFieldsValue({ table: res.table })
        }catch(_){ }
        // 如果是编辑已有 integration，我们尝试把返回的 columns 映射直接保存到该 integration 的 config 中
        if(editingIndex !== null){
          try{
            const existing = items[editingIndex]
            const updatedConfig = { ...(existing.config || {}), table: res.table }
            if(res.columns && res.columns.length){
              // ensure columns are stored as array of { orig_name, colname, sql_type }
              updatedConfig.columns = (res.columns || []).map((c:any)=> ({ orig_name: c.orig_name || c.orig || c.origName || c.name, colname: c.colname || c.name, sql_type: c.sql_type || c.sqlType || null }))
            }
            const updatePayload:any = { name: existing.name, type: existing.type, config: updatedConfig }
            await updateIntegration(existing.id, updatePayload)
            // refresh list and form to reflect saved mapping
            fetchList()
            form.setFieldsValue({ table: res.table })
            message.info('Saved mapping to integration config')
          }catch(e:any){ message.warning('Could not save mapping to integration: ' + (e.message || String(e))) }
        }
        else{
          // 如果是为一个新建的 integration 创建表（尚未保存 integration），则把 columns 放入 pendingMapping
          // 保存 integration 时，pendingMapping 会被写入 integration.config.columns
          if(res.columns && res.columns.length){ setPendingMapping(res.columns) }
        }
        setShowCreateTableModal(false)
      }else{
        message.error('Create table failed: ' + JSON.stringify(res))
      }
    }catch(e:any){ message.error(String(e)) }
  }

  return (
    <div style={{ padding: 12 }}>
      <Card title="Integrations">
        <Button type="primary" onClick={openNew} style={{ marginBottom: 12 }}>Add Integration</Button>
        <List dataSource={items} renderItem={(it:any, idx)=> (
          <List.Item actions={[
            <Button key="view" onClick={()=>{ Modal.info({ title: `Integration: ${it.name || it.host}`, content: (<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(it, null, 2)}</pre>), width: 700 }) }}>View</Button>,
            <Button key="test" onClick={async ()=>{ try{ const res = await testIntegration(it); Modal.success({ title: 'Connection OK', content: (<pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(res, null, 2)}</pre>) }) }catch(e:any){ const detail = e.body || e.message || String(e); Modal.error({ title: 'Connection failed', content: (<pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{detail}</pre>), width: 700 }) } }}>Test</Button>,
            <Button key="edit" onClick={()=>openEdit(it, idx)}>Edit</Button>,
            <Button key="del" danger onClick={()=>{ Modal.confirm({ title: 'Delete integration?', content: `Delete ${it.name || it.host}? This cannot be undone.`, onOk: async ()=>{ try{ await deleteIntegration(it.id); message.success('Deleted'); fetchList() }catch(e:any){ message.error(String(e)) } } }) }}>Delete</Button>
          ]}>
            <List.Item.Meta title={<a onClick={()=>openEdit(it, idx)}>{it.name || it.host}</a>} description={<div><Tag>{it.type}</Tag> {it.host}</div>} />
          </List.Item>
        )} />
      </Card>

      <Modal open={showModal} onCancel={()=>setShowModal(false)} onOk={save} title="Add Integration">
        <Form form={form} layout="vertical" initialValues={{ type: 'elasticsearch' }}>
          <Form.Item name="type" label="Type">
            <Select onChange={(v:any)=>{ form.setFieldsValue({ type: v }) }}>
              <Select.Option value="elasticsearch">Elasticsearch</Select.Option>
              <Select.Option value="logstash">Logstash</Select.Option>
              <Select.Option value="airflow">Airflow</Select.Option>
              <Select.Option value="postgresql">PostgreSQL</Select.Option>
              <Select.Option value="mysql">MySQL</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item shouldUpdate noStyle>
            {()=>{
              const t = form.getFieldValue('type')
              let hostLabel = 'Host'
              if(t === 'elasticsearch') hostLabel = 'Host (http://...)'
              else if(t === 'postgresql' || t === 'mysql') hostLabel = 'DB Host'
              else if(t === 'airflow') hostLabel = 'Host (http://...)'

              return (
                <>
                  <Form.Item name="host" label={hostLabel}><Input /></Form.Item>

                  {t === 'elasticsearch' && (
                    <>
                      <Form.Item name="username" label="Username (optional)"><Input /></Form.Item>
                      <Form.Item name="password" label="Password (optional)"><Input.Password /></Form.Item>
                    </>
                  )}

                  {t === 'logstash' && (
                    <>
                      <Form.Item label="Logstash Config (inputs/filters/outputs)">
                        <Divider />
                        <Form.List name={[ 'config', 'inputs' ]}>
                          {(fields, { add, remove }) => (
                            <div>
                              <h4>Inputs</h4>
                              {fields.map(f=> (
                                <div key={f.key} style={{ marginBottom: 8 }}>
                                  <Form.Item name={[f.name, 'type']} rules={[{ required: true }]} style={{ display: 'inline-block', width: '30%', marginRight: 8 }}>
                                    <Select>
                                      <Select.Option value="file">file</Select.Option>
                                      <Select.Option value="tcp">tcp</Select.Option>
                                      <Select.Option value="http">http</Select.Option>
                                    </Select>
                                  </Form.Item>
                                  <Form.Item name={[f.name, 'path']} style={{ display: 'inline-block', width: '60%' }}>
                                    <Input placeholder="path or host" />
                                  </Form.Item>
                                  <Button danger onClick={()=>remove(f.name)}>Remove</Button>
                                </div>
                              ))}
                              <Button onClick={()=>add({ type: 'file', path: '' })}>Add Input</Button>
                            </div>
                          )}
                        </Form.List>

                        <Form.List name={[ 'config', 'filters' ]}>
                          {(fields, { add, remove }) => (
                            <div>
                              <h4>Filters</h4>
                              {fields.map(f=> (
                                <div key={f.key} style={{ marginBottom: 8 }}>
                                  <Form.Item name={[f.name, 'type']} rules={[{ required: true }]} style={{ display: 'inline-block', width: '30%', marginRight: 8 }}>
                                    <Select>
                                      <Select.Option value="grok">grok</Select.Option>
                                      <Select.Option value="mutate">mutate</Select.Option>
                                    </Select>
                                  </Form.Item>
                                  <Form.Item name={[f.name, 'pattern']} style={{ display: 'inline-block', width: '60%' }}>
                                    <Input placeholder="pattern or config" />
                                  </Form.Item>
                                  <Button danger onClick={()=>remove(f.name)}>Remove</Button>
                                </div>
                              ))}
                              <Button onClick={()=>add({ type: 'grok', pattern: '' })}>Add Filter</Button>
                            </div>
                          )}
                        </Form.List>

                        <Form.List name={[ 'config', 'outputs' ]}>
                          {(fields, { add, remove }) => (
                            <div>
                              <h4>Outputs</h4>
                              {fields.map(f=> (
                                <div key={f.key} style={{ marginBottom: 8 }}>
                                  <Form.Item name={[f.name, 'type']} rules={[{ required: true }]} style={{ display: 'inline-block', width: '30%', marginRight: 8 }}>
                                    <Select>
                                      <Select.Option value="elasticsearch">elasticsearch</Select.Option>
                                      <Select.Option value="postgresql">postgresql</Select.Option>
                                    </Select>
                                  </Form.Item>
                                  <Form.Item name={[f.name, 'config']} style={{ display: 'inline-block', width: '60%' }}>
                                    <Input placeholder="config or host" />
                                  </Form.Item>
                                  <Button danger onClick={()=>remove(f.name)}>Remove</Button>
                                </div>
                              ))}
                              <Button onClick={()=>add({ type: 'elasticsearch', config: '' })}>Add Output</Button>
                            </div>
                          )}
                        </Form.List>

                        <Button style={{ marginTop: 8 }} onClick={()=>{
                          const vals = form.getFieldsValue()
                          const cfg = vals.config || {}
                          let txt = ''
                          const ins = cfg.inputs || []
                          ins.forEach((i:any)=>{ txt += `input { ${i.type} { ${i.path || ''} } }\n` })
                          const fil = cfg.filters || []
                          fil.forEach((f:any)=>{ txt += `filter { ${f.type} { ${f.pattern || ''} } }\n` })
                          const outs = cfg.outputs || []
                          outs.forEach((o:any)=>{ txt += `output { ${o.type} { ${o.config || ''} } }\n` })
                          Modal.info({ title: 'Logstash config preview', width: 700, content: (<pre style={{ whiteSpace: 'pre-wrap' }}>{txt}</pre>) })
                        }}>Preview Logstash Config</Button>
                      </Form.Item>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>If the list is empty, click "Test Connection" or "Refresh" after entering DB details.</div>
                    </>
                  )}

                  {t === 'airflow' && (
                    <>
                      <Form.Item name="username" label="Username (optional)"><Input /></Form.Item>
                      <Form.Item name="password" label="Password (optional)"><Input.Password /></Form.Item>
                      <Form.Item name="token" label="Bearer Token (optional)"><Input /></Form.Item>
                      <Form.Item name="path" label="API Path (optional)"><Input placeholder="e.g. /api/v1/health" /></Form.Item>
                    </>
                  )}

                  {(t === 'postgresql' || t === 'mysql') && (
                    <>
                      <Form.Item name="conn_str" label="Connection string (optional)"><Input placeholder="e.g. postgresql://user:pass@host:5432/dbname" onBlur={()=>fetchTablesFromForm()} /></Form.Item>
                      <Form.Item name="port" label="Port"><Input onBlur={()=>fetchTablesFromForm()} /></Form.Item>
                      <Form.Item name="user" label="User"><Input onBlur={()=>fetchTablesFromForm()} /></Form.Item>
                      <Form.Item name="password" label="Password"><Input.Password /></Form.Item>
                      <Form.Item name="dbname" label="Database"><Input onBlur={()=>fetchTablesFromForm()} /></Form.Item>
                      <Form.Item name="django_db" label="Django DB alias (optional)"><Input placeholder="e.g. default" onBlur={()=>fetchTablesFromForm()} /></Form.Item>

                      <Form.Item label="Destination table (optional)">
                        <Space>
                          <Form.Item noStyle name="table">
                            <Select style={{ minWidth: 240 }} placeholder="Select existing table or leave empty">
                              {availableTables.map(tb => (<Select.Option key={tb} value={tb}>{tb}</Select.Option>))}
                            </Select>
                          </Form.Item>
                          <Button onClick={()=>setShowCreateTableModal(true)}>Create table</Button>
                          <Button onClick={()=>fetchTablesFromForm()} type="default">Refresh</Button>
                        </Space>
                      </Form.Item>
                    </>
                  )}
                </>
              )
            }}
          </Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item>
            <Space>
              <Button onClick={handleTestFromModal}>Test Connection</Button>
              <Button type="primary" onClick={save}>Save</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={showCreateTableModal} title="Create table" onCancel={()=>setShowCreateTableModal(false)} footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={()=>setShowCreateTableModal(false)}>Cancel</Button>
          <Button onClick={async ()=>{
            try{
              const v = form.getFieldsValue()
              if(!modalEsIntegrationId || !modalIndexName){ message.warning('Select ES integration and index to preview'); return }
              const payload:any = { es_integration: modalEsIntegrationId, index: modalIndexName }
              payload.db_type = v.type === 'postgresql' ? 'postgres' : 'mysql'
              if(v.conn_str) payload.conn_str = v.conn_str
              else{
                payload.host = v.host || ''
                payload.user = v.user || v.username || ''
                payload.password = v.password || ''
                payload.database = v.dbname || v.database || ''
                payload.port = v.port || ''
                payload.django_db = v.django_db || undefined
              }
              const res = await integrationsPreviewEsMapping(payload)
              if(res && res.ok){
                setPreviewColumns(res.columns || [])
                setEditedColumns((res.columns || []).map((c:any)=> ({ ...c })))
                setShowPreviewModal(true)
              }else{
                message.error('Preview failed: ' + JSON.stringify(res))
              }
            }catch(e:any){ message.error(String(e)) }
          }}>Preview Schema</Button>
          <Button onClick={async ()=>{ await createTableFromEs(modalEsIntegrationId, modalIndexName) }}>Create from ES mapping</Button>
          <Button type="primary" onClick={handleCreateTable}>Create</Button>
        </div>
      )}>
        <Form layout="vertical">
          <Form.Item label="Table name">
            <Input value={creatingTableName} onChange={e=>setCreatingTableName(e.target.value)} />
          </Form.Item>
          <Form.Item label="Create from ES index (optional)">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Select id="create-es-select" value={modalEsIntegrationId} onChange={(v:any)=>setModalEsIntegrationId(v)} style={{ minWidth: 220 }} placeholder="Select ES integration" allowClear>
                {items.filter(i=>i.type === 'elasticsearch').map(i=> (<Select.Option key={i.id} value={i.id}>{i.name || i.config?.host || i.id}</Select.Option>))}
              </Select>
              <Input id="create-es-index" value={modalIndexName} onChange={(e)=>setModalIndexName(e.target.value)} placeholder="Index name" style={{ minWidth: 220 }} />
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>If provided, the ES index mapping will be used to build table columns where possible.</div>
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
                        const targetType = form.getFieldValue('type')
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
          <Space>
            <Button onClick={()=>{ setShowPreviewModal(false) }}>Close</Button>
            <Button type="primary" onClick={()=>{
              // copy editedColumns back into previewColumns and close modal
              setPreviewColumns(editedColumns)
              setShowPreviewModal(false)
            }}>Save Edits</Button>
          </Space>
        </div>
      </Modal>
    </div>
  )
}
export default Integrations;