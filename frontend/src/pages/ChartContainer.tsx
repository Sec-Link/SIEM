import React, { useEffect, useRef, useState } from 'react'

// 文件级中文说明：
// ChartContainer 是一个轻量的容器组件，为内部图表提供可响应的尺寸信息。
// - 使用 ResizeObserver（若浏览器支持）监听容器尺寸变化，作为主要机制；
// - 在不支持 ResizeObserver 的情况下回退到 window.resize 事件。
// - 通过 children(size) 把当前尺寸传递给子组件以便渲染适配。

type Size = { width: number; height: number }

export default function ChartContainer({ children, onSize }: { children: (size: Size)=>React.ReactNode, onSize?: (size: Size)=>void }){
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(()=>{
    const el = ref.current
    if(!el) return

    const update = () => {
      // 读取 DOM bounding rect，并把宽高向下取整为整数
      const r = el.getBoundingClientRect()
      const next = { width: Math.max(0, Math.floor(r.width)), height: Math.max(0, Math.floor(r.height)) }
      setSize(prev => {
        // 避免无谓的 state 更新：只有尺寸实际变化时才 setState
        if(prev.width === next.width && prev.height === next.height) return prev
        return next
      })
      if(onSize) onSize(next)
    }

    // 立即同步一次以便子组件首次渲染就能拿到尺寸
    update()

    // 优先使用 ResizeObserver，降级为 window.resize 事件以兼容旧环境
    let ro: ResizeObserver | null = null
    try{
      ro = new ResizeObserver(()=> update())
      ro.observe(el)
    }catch(e){
      // ResizeObserver 不可用：回落到监听窗口大小变化
      window.addEventListener('resize', update)
    }

    return ()=>{
      // 清理观察器或事件监听器
      if(ro) ro.disconnect()
      else window.removeEventListener('resize', update)
    }
  }, [onSize])

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', boxSizing: 'border-box', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children(size)}</div>
    </div>
  )
}
