// PanelConfigModal.tsx
// 说明：
// 该文件实现面板配置对话框（PanelConfigModal），用于编辑单个面板的标题、类型、数据源、SQL、字段绑定以及
// 可选的 Elasticsearch 集成配置。注释为中文说明，严格不改变源码逻辑，仅增加文档性注释以便维护。
// 主要功能点：
// - 支持从已保存的数据源或本地保存的 ES integration 中选择数据源
// - 支持输入 SQL 并通过后台 preview 接口提取列信息以供字段绑定
// - 支持从 ES mapping 拉取字段信息（best-effort）
// - 根据选中图表类型自动展示必要的字段绑定输入
// 注意事项：
// - 注释仅为说明和帮助阅读；运行逻辑保持不变
import React, { useEffect, useState } from 'react'
import { Modal, Form, Select, Input, Spin, Button, Alert } from 'antd'
import { listDatasources, queryPreview } from '../api'

export default function PanelConfigModal({ visible, panel, onCancel, onSave }:{ visible:boolean, panel:any, onCancel:Function, onSave:Function }){
  const [form] = Form.useForm()

  // 支持的图表类型列表（参考常见的 @ant-design/charts 类型）
  const CHART_TYPES = [
    'column','bar','stacked-bar','line','area','pie','scatter','radar','heatmap','box','histogram','treemap','funnel','waterfall','stock','dual-axis','bidirectional-bar','ring-progress','liquid','gauge','sunburst','sankey','word-cloud'
  ]

  // 不同图表类型需要的字段绑定映射（key 为表单字段名，label 为显示说明）
  const CHART_FIELD_MAP: Record<string, { key: string, label: string }[]> = {
    line: [ { key: 'xField', label: 'X Field' }, { key: 'yField', label: 'Y Field' } ],
    bar: [ { key: 'xField', label: 'Category Field' }, { key: 'yField', label: 'Value Field' } ],
    column: [ { key: 'xField', label: 'Category Field' }, { key: 'yField', label: 'Value Field' } ],
    pie: [ { key: 'angleField', label: 'Angle (value) Field' }, { key: 'colorField', label: 'Color (category) Field' } ],
    scatter: [ { key: 'xField', label: 'X Field' }, { key: 'yField', label: 'Y Field' } ],
  }

  // 可选字段列表（来自 SQL preview 或 ES mapping）
  const [availableFields, setAvailableFields] = useState<any[]>([])
  // 加载状态与错误状态，用于在 UI 中显示 loading 提示或错误消息
  const [loadingFields, setLoadingFields] = useState(false)
  const [datasources, setDatasources] = useState<any[]>([])
  const [sqlLoadError, setSqlLoadError] = useState<string | null>(null)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  // 本地保存的 integrations（为了方便快速选择 ES 连接）
  const [savedIntegrations, setSavedIntegrations] = useState<any[]>([])

  useEffect(()=>{
    if(visible){
      // 读取数据源列表（来自后端 API），任何错误均降级为空数组
      listDatasources().then(r=>setDatasources(r)).catch(()=>setDatasources([]))
      // 从 localStorage 读取本地保存的 integrations（主要是 ES 连接）以便快速选择
      try{ const s = localStorage.getItem('integrations'); setSavedIntegrations(s ? JSON.parse(s) : []) }catch(e){ setSavedIntegrations([]) }
      // 将 panel 中已有的配置预填入表单，保持与现有行为一致
      form.setFieldsValue({ title: panel?.config?.title || '', type: panel?.type || 'chart' })
      form.setFieldsValue({ datasource: panel?.config?.datasource || panel?.config?.datasourceId || panel?.config?.datasource, sql: panel?.config?.sql || panel?.config?.query || '' })
      // integration type: 'datasource' or 'elasticsearch'，如果 panel 有 esConfig 则预设为 elasticsearch
      if(panel?.config?.esConfig){
        form.setFieldsValue({ integrationType: 'elasticsearch', esHost: panel.config.esConfig.host, esIndex: panel.config.esConfig.index, esQuery: panel.config.esConfig.query || '' })
      } else {
        form.setFieldsValue({ integrationType: 'datasource' })
      }
      // 预加载已有的字段绑定（fieldBindings），保持原有配置不被覆盖
      const bindings = panel?.config?.fieldBindings || {}
      form.setFieldsValue(bindings)
      // 如果存在 SQL 且已选择数据源，则尝试通过 preview 获取字段信息以供绑定
      const sql = form.getFieldValue('sql') || panel?.config?.sql
      const dsForSql = form.getFieldValue('datasource') || panel?.config?.datasource || panel?.config?.datasourceId
      if(sql && dsForSql){
        setLoadingFields(true)
        setSqlLoadError(null)
        queryPreview({ datasource: dsForSql, sql, limit: 1 }).then((res:any)=>{
          const cols = res.columns || []
          const norm = cols.map((c:any)=> typeof c === 'string' ? { name: c, type: 'string' } : c)
          setAvailableFields(norm || [])
        }).catch((e)=>{
          // 预览失败则清空字段并记录错误信息（在 UI 中显示）
          setAvailableFields([])
          setSqlLoadError(String(e))
        }).finally(()=>setLoadingFields(false))
      } else {
        setAvailableFields([])
      }
    }
  },[visible])

  // dataset removed: fields are now loaded from SQL preview only

  // 当表单中的 datasource 或 sql 发生变化时，重新尝试加载 SQL preview 的字段信息
  useEffect(()=>{
    if(!visible) return
    let mounted = true
    const loadFromForm = async ()=>{
      const sql = form.getFieldValue('sql')
      const ds = form.getFieldValue('datasource')
      if(sql && ds){
        setLoadingFields(true)
        setSqlLoadError(null)
        try{
          const res:any = await queryPreview({ datasource: ds, sql, limit: 1 })
          if(!mounted) return
          const cols = res.columns || []
          const norm = cols.map((c:any)=> typeof c === 'string' ? { name: c, type: 'string' } : c)
          setAvailableFields(norm || [])
        }catch(e){ if(mounted){ setAvailableFields([]); setSqlLoadError(String(e)) } }
        finally{ if(mounted) setLoadingFields(false) }
      }
    }
    // load once on mount/visible
    loadFromForm()
    return ()=>{ mounted = false }
  },[visible, form])

  // 从 Elasticsearch mapping 加载字段（best-effort）。注意：直接使用 fetch 访问 ES host，网络或跨域问题会导致失败。
  const loadEsFields = async ()=>{
    setIntegrationError(null)
    const esHost = form.getFieldValue('esHost')
    const esIndex = form.getFieldValue('esIndex')
    if(!esHost || !esIndex){
      setIntegrationError('Please enter ES host and index')
      return
    }
    setLoadingFields(true)
    try{
      const url = `${esHost.replace(/\/$/, '')}/${esIndex}/_mapping`
      const resp = await fetch(url, { method: 'GET' })
      if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
      const data = await resp.json()
      // Extract property names
      const idxEntry = Object.values(data)[0] || {}
      const props = ((idxEntry as any).mappings && (idxEntry as any).mappings.properties) || {}
      const cols = Object.keys(props).map(k=> ({ name: k, type: (props[k].type || 'object') }))
      setAvailableFields(cols)
    }catch(e:any){
      setAvailableFields([])
      setIntegrationError(String(e))
    }finally{
      setLoadingFields(false)
    }
  }

  // 用户点击 Modal 的 OK 后收集表单值并构造新的 panel 配置，然后通过 onSave 回传给父组件
  const handleOk = async ()=>{
    const values = await form.validateFields()
    // 提取当前图表类型所需的字段绑定
    const bindings: Record<string,string> = {}
    const type = values.type
    const mapping = CHART_FIELD_MAP[type] || []
    mapping.forEach(m=>{ if(values[m.key]) bindings[m.key] = values[m.key] })
    try{
      const newConfig: any = { ...panel.config, title: values.title, datasource: values.datasource, sql: values.sql, fieldBindings: bindings }
      // 若用户选择 Elasticsearch 集成，则把 esConfig 放回新的 config 中
      if(values.integrationType === 'elasticsearch'){
        newConfig.esConfig = { host: values.esHost, index: values.esIndex, query: values.esQuery }
      } else {
        delete newConfig.esConfig
      }
      // 将修改后的 panel 对象交给父组件保存（onSave 可能会更新 state 并触发持久化）
      await onSave({ ...panel, type: values.type, config: newConfig })
    }catch(e){
      // 保持原有行为：打印错误并向上抛出，便于调用方处理
      console.error('onSave failed', e)
      throw e
    }
  }

  // 调试用：当对话框打开时打印 panel（不会影响逻辑）
  if(visible) console.debug('PanelConfigModal visible, panel=', panel)

  return (
    <Modal open={visible} onCancel={()=>onCancel()} onOk={handleOk} title={`Configure Panel ${panel?.i}`}>
      <Form form={form} layout="vertical" initialValues={{ integrationType: 'datasource' }}>
        <Form.Item name="title" label="Title">
          <Input />
        </Form.Item>
        <Form.Item name="type" label="Type">
          <Select onChange={(v)=>{ form.setFieldsValue({}); /* clear dynamic fields when type changes */ }}>
            <Select.Option value="chart">Generic Chart</Select.Option>
            {CHART_TYPES.map(t=> <Select.Option key={t} value={t}>{t}</Select.Option>)}
            <Select.Option value="table">Table</Select.Option>
            <Select.Option value="text">Text</Select.Option>
            <Select.Option value="image">Image</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="datasource" label="DataSource (optional)">
          <Select allowClear onChange={(val)=>{
            // if user selected an ES integration (we store object in option value), auto-fill es fields
            if(val && typeof val === 'object' && val.type === 'elasticsearch'){
              form.setFieldsValue({ integrationType: 'elasticsearch', esHost: val.host, esIndex: form.getFieldValue('esIndex') || '', esQuery: form.getFieldValue('esQuery') || '' })
            }
          }}>
            {datasources.map((d:any)=> <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            {savedIntegrations.filter(i=>i.type==='elasticsearch').map((it:any,idx)=> <Select.Option key={`es-${idx}`} value={{ type: 'elasticsearch', name: it.name, host: it.host }}>{`ES: ${it.name || it.host}`}</Select.Option>)}
          </Select>
        </Form.Item>

        <Form.Item name="integrationType" label="Integration">
          <Select>
            <Select.Option value="datasource">Datasource / SQL</Select.Option>
            <Select.Option value="elasticsearch">Elasticsearch</Select.Option>
          </Select>
        </Form.Item>

        {/* Elasticsearch integration fields */}
        <Form.Item shouldUpdate noStyle>
          {()=>{
            const t = form.getFieldValue('integrationType')
            if(t !== 'elasticsearch') return null
            return (
              <div>
                <h4>Elasticsearch configuration</h4>
                {integrationError ? <Alert type="error" message={integrationError} style={{ marginBottom: 8 }} /> : null}
                <Form.Item name="esHost" label="ES Host (e.g. http://localhost:9200)" rules={[{ required: true, message: 'ES host required' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="esIndex" label="Index name" rules={[{ required: true, message: 'Index required' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="esQuery" label="Optional ES query (JSON)">
                  <Input.TextArea rows={4} placeholder='e.g. { "query": { "match_all": {} } }' />
                </Form.Item>
                <Form.Item>
                  <Button onClick={loadEsFields} loading={loadingFields}>Load fields from ES mapping</Button>
                </Form.Item>
              </div>
            )
          }}
        </Form.Item>

        <Form.Item name="sql" label="SQL (optional)">
          <Input.TextArea rows={6} placeholder="Enter SQL to run for this panel (overrides dataset)" />
        </Form.Item>

        {/* Dynamic field bindings for selected chart type */}
        <Form.Item shouldUpdate noStyle>
          {()=>{
            const t = form.getFieldValue('type')
            const mapping = CHART_FIELD_MAP[t] || []
            if(mapping.length === 0) return null
            return (
              <div>
                <h4>Field bindings for {t}</h4>
                {loadingFields ? <Spin /> : (
                  mapping.map(m=> (
                    <Form.Item key={m.key} name={m.key} label={m.label} rules={[{ required: true, message: `Select ${m.label}` }]}>
                      <Select allowClear>
                        {availableFields.map((f:any)=> <Select.Option key={f.name} value={f.name}>{f.name} ({f.type})</Select.Option>)}
                      </Select>
                    </Form.Item>
                  ))
                )}
              </div>
            )
          }}
        </Form.Item>
      </Form>
    </Modal>
  )
}
