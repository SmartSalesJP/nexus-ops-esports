import type { Edge, Node } from '@xyflow/react'
import type { FlowData } from '../types'

const persistedNode=(node:Node)=>{
  const {selected:_selected,dragging:_dragging,measured:_measured,width:_width,height:_height,...value}=node
  void _selected;void _dragging;void _measured;void _width;void _height
  return value
}
const persistedEdge=(edge:Edge)=>{const {selected:_selected,...value}=edge;void _selected;return value}

export const flowsEqualForDirty=(left:FlowData,right:FlowData)=>JSON.stringify({nodes:left.nodes.map(persistedNode),edges:left.edges.map(persistedEdge),viewport:left.viewport})===JSON.stringify({nodes:right.nodes.map(persistedNode),edges:right.edges.map(persistedEdge),viewport:right.viewport})
