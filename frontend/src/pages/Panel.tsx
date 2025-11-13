import React, { useEffect, useRef, useState } from 'react'
import { Button, Input } from 'antd'
import ChartContainer from './ChartContainer'

// 文件级中文说明：
// Panel 组件是仪表盘中每个面板的包装器，提供：
// - 标题显示与可编辑（在编辑模式下点击可内联编辑）
// - Configure / Remove 操作按钮（在编辑模式下可见）
// - 自动为子内容提供可响应的尺寸信息（通过 ChartContainer）

type ChildRenderer = ((size:{width:number,height:number})=>React.ReactNode) | React.ReactNode

export default function Panel({ panel, onConfigure, onRemove, children, isEditMode, onTitleChange }:{ panel:any, onConfigure:Function, onRemove:Function, children?: ChildRenderer, isEditMode?:boolean, onTitleChange?: (newTitle:string)=>void }){
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(panel.config?.title || `Panel ${panel.i}`)
  const inputRef = useRef<any>(null)

  // 当 panel 的配置变化时同步标题
  useEffect(()=>{
    setTitle(panel.config?.title || `Panel ${panel.i}`)
  }, [panel.config?.title, panel.i])

  // 进入编辑状态时自动 focus 输入框
  useEffect(()=>{
    if(editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  function finishEdit(){
    setEditing(false)
    // 如果标题被修改，调用 onTitleChange 回调以便上层保存变更
    if(onTitleChange && title !== (panel.config?.title || `Panel ${panel.i}`)){
      onTitleChange(title)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 标题：在编辑模式下允许内联编辑。添加 no-drag 类以避免在点击标题时触发拖拽 */}
          {isEditMode ? (
            editing ? (
              <Input ref={inputRef} size="small" value={title} onChange={e=>setTitle(e.target.value)} onBlur={finishEdit} onPressEnter={finishEdit} className="no-drag" style={{ width: 200 }} />
            ) : (
              <div className="no-drag" onClick={()=>setEditing(true)} style={{ fontWeight: 600, cursor: 'text' }}>{title}</div>
            )
          ) : (
            <div style={{ fontWeight: 600 }}>{title}</div>
          )}
        </div>
        <div>
          {isEditMode ? (
            <>
              {/* 配置和移除按钮点击时停止事件冒泡以避免触发拖拽 */}
              <Button size="small" onClick={(e)=>{ e.stopPropagation(); onConfigure(panel) }}>Configure</Button>
              <Button size="small" danger onClick={(e)=>{ e.stopPropagation(); onRemove(panel.i) }} style={{ marginLeft: 8 }}>Remove</Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="panel-content no-drag" style={{ flex: 1, minHeight: 0, display: 'block' }}>
        {/* 使用 ChartContainer 获取容器精确尺寸并传给 children 渲染函数。
            为了兼容以前的用法，如果 children 是普通 ReactNode，则直接渲染在一个自适应容器中。 */}
        {typeof children === 'function' ? (
          <ChartContainer>
            {(size)=> (
              <div style={{ width: '100%', height: '100%' }}>
                {children(size)}
              </div>
            )}
          </ChartContainer>
        ) : (
          <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
