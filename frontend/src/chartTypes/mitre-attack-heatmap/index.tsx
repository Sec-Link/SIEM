import React from 'react'

export type AggRow = { technique_id?: string, count: number }

export default function MitreAttackHeatmap({ aggRows }:{ aggRows: AggRow[] }){
  // Minimal placeholder: real heatmap implementation can replace this file
  const total = Array.isArray(aggRows) ? aggRows.reduce((s,n)=>s + (Number(n.count)||0), 0) : 0
  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>MITRE ATT&CK Heatmap (placeholder)</div>
      <div>Techniques: {aggRows ? aggRows.length : 0}</div>
      <div>Total Count: {total}</div>
    </div>
  )
}
