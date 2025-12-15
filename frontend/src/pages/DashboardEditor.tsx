import React, { useEffect, useState } from 'react'
import GridLayoutLib, { Layout, WidthProvider } from 'react-grid-layout'
const GridLayout = WidthProvider(GridLayoutLib)
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { Button, Space, Modal } from 'antd'
import { Select, message } from 'antd'
import { queryPreview, listDatasources } from '../api'
import Panel from '../pages/Panel'
import PanelConfigModal from '../pages/PanelConfigModal'
import { listDashboards, createDashboard, getDashboard, updateDashboard, deleteDashboard } from '../api'
import { Column, Bar, Line, Pie, Scatter } from '@ant-design/charts'
import { Table } from 'antd'

// 文件级中文说明：
// DashboardEditor 提供一个可视化面板布局编辑器，允许：
// - 列表/加载已有 dashboards
// - 添加/删除面板（Panels），并为面板配置 SQL 查询或数据绑定
// - 基于 SQL 预览创建面板并填充 runtimeData
// 注意：为了简化，dataset 的通用支持被移除，运行时数据主要通过 SQL 预览获得。
// 该文件使用 react-grid-layout 管理拖拽与尺寸调整，图表使用 @ant-design/charts 渲染。
export default function DashboardEditor({ dashboardId, onBack }:{ dashboardId?:string, onBack:()=>void }){
  const [isEditMode, setIsEditMode] = useState<boolean>(true)
  const [dashboards, setDashboards] = useState<any[]>([])
  const [layout, setLayout] = useState<Layout[]>([])
  const [panels, setPanels] = useState<any[]>([])
  const [configPanel, setConfigPanel] = useState<any | null>(null)
  const [sqlModalVisible, setSqlModalVisible] = useState(false)
  const [sqlDatasource, setSqlDatasource] = useState<string | null>(null)
  const [sqlText, setSqlText] = useState<string>('')
  const [datasources, setDatasources] = useState<any[]>([])
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  // panels default to simple 'chart' type; removed global chart-type selector

  useEffect(()=>{
    // 初始加载：dashboards 列表与可用数据源；若传入 dashboardId 则加载该 dashboard 的 layout 与 panels
    listDashboards().then(r=>setDashboards(r)).catch(()=>setDashboards([]))
    listDatasources().then(r=>setDatasources(r)).catch(()=>setDatasources([]))
    if(dashboardId){
      getDashboard(dashboardId).then(d=>{
        // 后端返回的 dashboard 对象应包含 layout 与面板配置（此处直接复用 layout 字段作为 panels）
        setLayout(d.layout || [])
        setPanels(d.layout || [])
        setName(d.name || '')
        setDescription(d.description || '')
      }).catch(()=>{})
    }else{
      // seed example
      const seed = [{ i: '1', x: 0, y: 0, w: 6, h: 6, type: 'chart', config: { title: 'Sample', dataset: null } }]
      setLayout(seed)
      setPanels(seed)
    }
  },[dashboardId])

  function onLayoutChange(newLayout: Layout[]){
    setLayout(newLayout)
    setPanels(prev => prev.map(p=>{
      const item = newLayout.find(l=>l.i === p.i)
      return item ? { ...p, x: item.x, y: item.y, w: item.w, h: item.h } : p
    }))
  }

  function addPanel(){
    const id = String(Date.now())
    const p = { i: id, x: 0, y: Infinity as any, w: 6, h: 6, type: 'chart', config: { title: 'New Panel' } }
    setPanels(prev=>[...prev, p])
    setLayout(prev=>[...prev, { i: p.i, x: p.x, y: p.y, w: p.w, h: p.h }])
  }

  function removePanel(id:string){
    setPanels(prev=>prev.filter(p=>p.i!==id))
    setLayout(prev=>prev.filter(l=>l.i!==id))
  }

  function openConfig(panel:any){
    setConfigPanel(panel)
  }

  function saveConfig(panel:any){
    // 说明：保存某个面板的配置（例如 SQL），并尝试用 queryPreview 拉取 runtimeData 填充面板
    console.log('saveConfig called', { panel, setPanelsType: typeof setPanels })
    try{
      if(typeof setPanels !== 'function'){
        console.error('saveConfig: setPanels is not a function', setPanels)
      }else{
        setPanels(prev=>{
          console.log('saveConfig prev panels', prev)
          try{
            const arr = Array.isArray(prev) ? prev : []
            const next = arr.map(p=> p.i === panel.i ? panel : p)
            console.log('saveConfig next panels', next)
            return next
          }catch(err){ console.error('error mapping panels', err); return prev }
        })
      }
    }catch(err){ console.error('saveConfig initial setPanels error', err) }
  // 尝试为 panel 拉取 SQL 预览并将结果写入 panel.runtimeData（用于即时预览）
    (async ()=>{
      try{
  // 如果 panel.config 中包含 SQL 且指定了数据源，则优先使用 SQL 执行预览
        const sql = panel.config?.sql
        const ds = panel.config?.datasource || panel.config?.datasourceId || panel.config?.dataset
        if(sql && ds){
          try{
            const previewRes = await queryPreview({ datasource: ds, sql, limit: 200 })
            const cols = (previewRes.columns || []).map((c:any)=> typeof c === 'string' ? c : c.name)
            const rows = previewRes.rows || []
            const mapped = rows.map((rrow:any[])=>{
              const obj:any = {}
              cols.forEach((c:string|any,i:number)=>{
                const name = typeof c === 'string' ? c : c.name
                obj[name] = rrow[i]
              })
              return obj
            })
            try{
              // 将 runtimeData 写回 state 中以便立即在 UI 上预览
              if(typeof setPanels === 'function') setPanels(prev=> (Array.isArray(prev) ? prev.map(p=> p.i === panel.i ? { ...p, runtimeData: mapped } : p) : prev))
              else console.error('setPanels not a function when attaching runtimeData', setPanels)
            }catch(err){ console.error('error setting runtimeData panels', err) }
            return
          }catch(e){ console.warn('sql preview failed', e) }
        }
        // dataset fallback removed — SQL-only flow above handles runtimeData
      }catch(e){ console.warn('panel preview failed', e) }
    })()
    setConfigPanel(null)
  }

  async function handleSave(){
    const payload = { name: name || 'Unnamed', description: description || '', layout: panels }
    try{
      if(dashboardId){
        await updateDashboard(dashboardId, payload)
        Modal.success({ title: 'Saved' })
      }else{
        const created = await createDashboard(payload)
        Modal.success({ title: 'Created', content: `ID ${created.id}` })
      }
    }catch(e){
      Modal.error({ title: 'Save failed', content: String(e) })
    }
  }

  // dataset support removed — runtimeData is populated from SQL preview when saving configs

  // helper to measure text width using canvas
  function measureTextWidth(text: string, font = '12px sans-serif'){
    try{
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if(!ctx) return text.length * 7
      ctx.font = font
      const metrics = ctx.measureText(text)
      return Math.ceil(metrics.width)
    }catch(e){
      return text.length * 7
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Inline dashboard name editing when in edit mode */}
          {isEditMode ? (
            <input value={name} onChange={e=>setName(e.target.value)} onBlur={handleSave} onKeyDown={e=>{ if(e.key === 'Enter') handleSave() }} placeholder="Dashboard name" style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd' }} />
          ) : (
            <div style={{ fontWeight: 700 }}>{name || 'Unnamed Dashboard'}</div>
          )}
          <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description" style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', width: 360 }} />
        </div>
        <Space>
          <Button onClick={()=>setIsEditMode(m=>!m)}>{isEditMode ? 'Exit Edit' : 'Enter Edit'}</Button>
          <Button onClick={addPanel} disabled={!isEditMode}>Add Panel</Button>
          <Button onClick={()=>{ setSqlDatasource(null); setSqlText(''); setSqlModalVisible(true) }} disabled={!isEditMode}>New Panel from SQL</Button>
          <Button type="primary" onClick={handleSave}>Save Layout</Button>
          <Button onClick={onBack}>Back to List</Button>
        </Space>
      </div>

      <div style={{ border: '1px dashed #ddd', padding: 0, borderRadius: 8, width: '100%' }}>
  <GridLayout className="layout" layout={layout} cols={12} rowHeight={30} draggableHandle=".panel-header" draggableCancel=".no-drag, button, input, .ant-btn" onLayoutChange={onLayoutChange} margin={[0,0]} containerPadding={[0,0]} width={undefined as any} isDraggable={isEditMode} isResizable={isEditMode}>
          {panels.map(p=> (
            <div key={p.i} data-grid={{ i: p.i, x: p.x, y: p.y, w: p.w, h: p.h }} style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <Panel panel={p} onConfigure={openConfig} onRemove={removePanel} isEditMode={isEditMode} onTitleChange={(newTitle:string)=>{
                setPanels(prev=> prev.map(pp=> pp.i === p.i ? { ...pp, config: { ...pp.config, title: newTitle } } : pp))
              }}>
                {(size:{width:number,height:number}) => (
                  <div style={{ width: '100%', height: '100%' }}>
                    {p.type === 'chart' || (p.type && p.type !== 'table' && p.type !== 'text' && p.type !== 'image') ? (
                          (() => {
                            const raw = (p.runtimeData && p.runtimeData.length>0) ? p.runtimeData : (p.config?.demoData || [{ name: 'A', value: 10 }, { name: 'B', value: 20 }])
                            const data = Array.isArray(raw) ? raw : (raw ? [raw] : [])
                            const bindings = p.config?.fieldBindings || {}
                            const chartType = p.config?.chartType || p.type || 'column'
                            // attempt to detect default x field if not bound
                            const detectedX = data && data[0] ? Object.keys(data[0]).find(k=>k!=='value' && k!=='count' && k!=='amount') || Object.keys(data[0])[0] : 'name'
                            try{
                              switch(chartType){
                                case 'line':
                                  return <Line data={data} xField={bindings.xField || detectedX} yField={bindings.yField || 'value'} height={size.height} width={size.width} />
                                case 'pie':
                                  return <Pie data={data} angleField={bindings.angleField || 'value'} colorField={bindings.colorField || detectedX} height={size.height} width={size.width} />
                                case 'scatter':
                                  return <Scatter data={data} xField={bindings.xField || 'x'} yField={bindings.yField || 'y'} height={size.height} width={size.width} />
                                case 'bar': {
                                  const barX = bindings.xField || 'value'
                                  const barY = bindings.yField || detectedX
                                  return <Bar data={data} xField={barX} yField={barY} height={size.height} width={size.width} />
                                }
                                case 'column':
                                default:
                                  return <Column data={data} xField={bindings.xField || detectedX} yField={bindings.yField || 'value'} height={size.height} width={size.width} />
                              }
                            }catch(e){
                              // fallback to basic column
                              const fallbackX = Object.keys(data[0]||{}).find(k=>k!=='value') || 'name'
                              return <Column data={data} xField={fallbackX} yField="value" height={size.height} width={size.width} />
                            }
                          })()
                        ) : p.type === 'table' ? (
                      <>
                        {p.runtimeData && p.runtimeData.length>0 ? (
                          <Table dataSource={p.runtimeData} columns={Object.keys(p.runtimeData[0]).map(k=>({ title: k, dataIndex: k, key: k }))} pagination={false} rowKey={(r:any)=> JSON.stringify(r)} />
                        ) : (
                          <div>No data</div>
                        )}
                      </>
                    ) : (
                      <div>Preview</div>
                    )}
                  </div>
                )}
              </Panel>
            </div>
          ))}
        </GridLayout>
      </div>

      <PanelConfigModal visible={!!configPanel} panel={configPanel} onCancel={()=>setConfigPanel(null)} onSave={saveConfig} />
      <Modal
        title="Create Panel from SQL"
        open={sqlModalVisible}
        onCancel={()=>setSqlModalVisible(false)}
        onOk={async ()=>{
          console.log('SQL modal OK clicked', { sqlDatasource, sqlText })
          if(!sqlDatasource || !sqlText){ message.error('请选择数据源并输入 SQL'); return }
          message.loading({ content: 'Running SQL preview...', key: 'sqlPreview' })
          try{
            const res = await queryPreview({ datasource: sqlDatasource, sql: sqlText, limit: 200 })
            console.log('queryPreview result', res)
            const cols = res.columns || []
            const rows = res.rows || []
            const mapped = rows.map((r:any[])=>{
              const obj:any = {}
              cols.forEach((c:any,i:number)=>{
                const name = typeof c === 'string' ? c : c.name
                obj[name] = r[i]
              })
              return obj
            })
            // create panel in current dashboard
            const id = String(Date.now())
            const newPanel = { i: id, x: 0, y: Infinity as any, w: 6, h: 6, type: 'table', config: { title: 'SQL Panel', datasource: sqlDatasource, sql: sqlText }, runtimeData: mapped }
            setPanels(prev=>{
              const next = [...prev, newPanel]
              console.log('panels after add', next)
              return next
            })
            setLayout(prev=>{
              const next = [...prev, { i: id, x: 0, y: Infinity as any, w: 6, h: 6 }]
              console.log('layout after add', next)
              return next
            })
            setSqlModalVisible(false)
            // clear SQL inputs so subsequent opens start fresh
            setSqlDatasource(null)
            setSqlText('')
            message.success({ content: 'Panel created from SQL', key: 'sqlPreview' })
          }catch(e:any){
            console.error('SQL preview failed', e)
            message.error({ content: `SQL preview failed: ${e?.message || e}`, key: 'sqlPreview' })
          }
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Select style={{ minWidth: 240 }} allowClear placeholder="选择 DataSource" value={sqlDatasource ?? undefined} onChange={v=>setSqlDatasource(v)}>
            {datasources.map((d:any)=> <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
          </Select>
        </div>
        <div>
          <textarea rows={8} style={{ width:'100%', fontFamily: 'monospace' }} value={sqlText} onChange={e=>setSqlText(e.target.value)} placeholder="Enter SQL here" />
        </div>
      </Modal>
    </div>
  )
}
