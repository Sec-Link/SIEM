import React, { useEffect, useState } from 'react'
import { listDashboards, createDashboard, deleteDashboard } from '../api'
import { Button, Space, Modal } from 'antd'

// 文件级中文说明：
// DashboardList 提供仪表盘的列表示界面，支持创建、编辑和删除仪表盘。
// 设计：
// - 使用 `listDashboards` 加载当前可用的仪表盘列表
// - 新建仪表盘后会直接跳转到编辑器（通过 onEdit 回调）以便用户立即配置面板
export default function DashboardList({ onEdit }:{ onEdit?:(id?:string)=>void }){
  const [list, setList] = useState<any[]>([])
  // 从后端加载仪表盘列表并设置到 state
  function reload(){
    listDashboards().then(r=>setList(r)).catch(()=>setList([]))
  }
  useEffect(()=>{ reload() },[])

  function handleCreate(){
    // 创建一个最小 payload 的新仪表盘，然后如果提供了 onEdit 回调就打开编辑器
    const payload = { name: 'New Dashboard', description: '', layout: [] }
    createDashboard(payload).then((created)=>{
      // open editor for created dashboard so user can edit name/description immediately
      if(onEdit) onEdit(String(created.id))
      else reload()
    }).catch(()=>reload())
  }

  function handleDelete(id:string){
    // 删除确认对话框，确认后删除并刷新列表
    Modal.confirm({ title: 'Delete dashboard?', onOk: ()=> deleteDashboard(id).then(()=>reload()) })
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Dashboards</h2>
        <Button type="primary" onClick={handleCreate}>Create New Dashboard</Button>
      </div>
      {list.length === 0 ? (
        <div>No dashboards yet.</div>
      ) : (
        <div>
          {list.map((d:any)=> (
            <div key={d.id} style={{ padding: 12, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ color: '#666', fontSize: 12 }}>{d.description}</div>
              </div>
              <Space>
                <Button onClick={()=> onEdit && onEdit(String(d.id)) }>Edit</Button>
                <Button danger onClick={()=>handleDelete(String(d.id))}>Delete</Button>
              </Space>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
