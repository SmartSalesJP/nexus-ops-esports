import { useCallback, useState } from 'react'
import { addEdge, Background, Controls, MiniMap, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node, type Viewport } from '@xyflow/react'
import { Link2, Plus, Save, StickyNote, Trash2 } from 'lucide-react'
import type { FlowData, Task } from '../types'

type Props={initialFlow:FlowData;tasks:Task[];onSave:(flow:FlowData)=>void}
export function ProjectCanvas({initialFlow,tasks,onSave}:Props){
 const [nodes,setNodes,onNodesChange]=useNodesState(initialFlow.nodes),[edges,setEdges,onEdgesChange]=useEdgesState(initialFlow.edges)
 const [selected,setSelected]=useState<{nodes:Node[];edges:Edge[]}>({nodes:[],edges:[]})
 const [taskRef,setTaskRef]=useState(''),[sourceId,setSourceId]=useState(''),[targetId,setTargetId]=useState(''),[viewport,setViewport]=useState<Viewport>(initialFlow.viewport)
 const connect=useCallback((connection:Connection)=>setEdges((current)=>connection.source&&connection.target&&connection.source!==connection.target&&!current.some((edge)=>edge.source===connection.source&&edge.target===connection.target)?addEdge({...connection,animated:true},current):current),[setEdges])
 const addNode=(kind:'card'|'text')=>{const task=tasks.find((item)=>item.id===taskRef);const id=`node-${Date.now()}`;setNodes((current)=>[...current,{id,position:{x:160+current.length*24,y:120+current.length*18},data:{label:task?`${task.title}\n${task.id}`:kind==='card'?'新しいカード':'テキストメモ',taskIds:task?[task.id]:[]},className:kind==='text'?'flow-text':'flow-card'}])}
 const remove=()=>{const nodeIds=new Set(selected.nodes.map((node)=>node.id)),edgeIds=new Set(selected.edges.map((edge)=>edge.id));setNodes((current)=>current.filter((node)=>!nodeIds.has(node.id)));setEdges((current)=>current.filter((edge)=>!edgeIds.has(edge.id)&&!nodeIds.has(edge.source)&&!nodeIds.has(edge.target)));setSelected({nodes:[],edges:[]})}
 const connectSelected=()=>{if(!sourceId||!targetId||sourceId===targetId)return;connect({source:sourceId,target:targetId,sourceHandle:null,targetHandle:null})}
 const disconnectSelected=()=>{if(!sourceId||!targetId)return;setEdges((current)=>current.filter((edge)=>!(edge.source===sourceId&&edge.target===targetId)))}
 const moveSelected=(dx:number,dy:number)=>{const ids=new Set(selected.nodes.map((node)=>node.id));setNodes((current)=>current.map((node)=>ids.has(node.id)?{...node,position:{x:node.position.x+dx,y:node.position.y+dy}}:node))}
 return <section className="canvas-section" aria-labelledby="canvas-title">
  <div className="section-heading"><div><span className="eyebrow">IDEATION SPACE</span><h2 id="canvas-title">プロジェクトキャンバス</h2><p><b>企画補助用です。進捗の正本ではありません。</b> タスク状態は「タスク進行表」で管理してください。</p></div><button className="button primary" onClick={()=>onSave({nodes,edges,viewport})}><Save size={17}/>保存</button></div>
  <div className="canvas-legend" aria-label="ノード種別"><span><i className="legend-user"/>通常ノード</span><span><i className="legend-complete"/>完了付箋（再オープン表示あり）</span><span><i className="legend-summary"/>週次summary</span></div>
  <div className="canvas-toolbar" aria-label="キャンバス操作">
    <div><label className="sr-only" htmlFor="canvas-task-ref">参照するタスク</label><select id="canvas-task-ref" value={taskRef} onChange={(event)=>setTaskRef(event.target.value)}><option value="">タスク参照なし</option>{tasks.map((task)=><option value={task.id} key={task.id}>{task.id} {task.title}</option>)}</select></div>
    <button className="button ghost" onClick={()=>addNode('card')}><Plus size={17}/>カード追加</button><button className="button ghost" onClick={()=>addNode('text')}><StickyNote size={17}/>テキスト追加</button><button className="button danger" onClick={remove} disabled={!selected.nodes.length&&!selected.edges.length}><Trash2 size={17}/>選択を削除</button>
  </div>
  <div className="canvas-toolbar keyboard-tools" aria-label="ドラッグを使わない接続と移動">
    <div><label htmlFor="edge-source">接続元</label><select id="edge-source" value={sourceId} onChange={(event)=>setSourceId(event.target.value)}><option value="">選択</option>{nodes.map((node)=><option key={node.id} value={node.id}>{String(node.data.label).split('\n')[0]}</option>)}</select></div>
    <div><label htmlFor="edge-target">接続先</label><select id="edge-target" value={targetId} onChange={(event)=>setTargetId(event.target.value)}><option value="">選択</option>{nodes.map((node)=><option key={node.id} value={node.id}>{String(node.data.label).split('\n')[0]}</option>)}</select></div>
    <button className="button ghost" onClick={connectSelected} disabled={!sourceId||!targetId||sourceId===targetId}><Link2 size={15}/>接続</button><button className="button ghost" onClick={disconnectSelected} disabled={!sourceId||!targetId}>接続解除</button>
    <fieldset><legend>選択ノードを移動</legend><button type="button" onClick={()=>moveSelected(0,-20)} disabled={!selected.nodes.length} aria-label="上へ移動">↑</button><button type="button" onClick={()=>moveSelected(-20,0)} disabled={!selected.nodes.length} aria-label="左へ移動">←</button><button type="button" onClick={()=>moveSelected(20,0)} disabled={!selected.nodes.length} aria-label="右へ移動">→</button><button type="button" onClick={()=>moveSelected(0,20)} disabled={!selected.nodes.length} aria-label="下へ移動">↓</button></fieldset>
  </div>
  <p className="toolbar-hint"><Link2 size={15}/>ドラッグ操作の代わりに、上の選択欄と移動ボタンを利用できます。</p>
  <div className="flow-shell">
   <ReactFlow nodes={nodes} edges={edges} viewport={viewport} onMoveEnd={(_,next)=>setViewport(next)} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onSelectionChange={setSelected} deleteKeyCode={['Backspace','Delete']} aria-label="プロジェクトフローキャンバス">
    <Background color="#25365f" gap={28}/><Controls position="bottom-left"/><MiniMap pannable zoomable nodeColor="#4f7cff" maskColor="rgba(6,9,19,.72)"/>
   </ReactFlow>
  </div>
 </section>
}
