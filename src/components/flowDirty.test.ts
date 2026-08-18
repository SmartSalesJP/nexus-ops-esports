import { describe, expect, it } from 'vitest'
import type { FlowData } from '../types'
import { flowsEqualForDirty } from './flowDirty'

const flow=():FlowData=>({nodes:[{id:'manual:1',position:{x:10,y:20},data:{label:'手動カード',taskIds:['P0-01']},className:'flow-card'}],edges:[{id:'manual-edge:1',source:'manual:1',target:'phase-0'}],viewport:{x:1,y:2,zoom:1.1}})

describe('canvas dirty comparison',()=>{
  it('ignores transient React Flow state but detects every persisted manual change deeply',()=>{
    const original=flow(),transient=structuredClone(original);transient.nodes[0]={...transient.nodes[0],selected:true,dragging:false,measured:{width:120,height:60}};transient.edges[0]={...transient.edges[0],selected:true}
    expect(flowsEqualForDirty(original,transient)).toBe(true)
    for(const mutate of [(value:FlowData)=>{value.nodes[0].position.x++},(value:FlowData)=>{value.nodes[0].data={...value.nodes[0].data,label:'変更'}},(value:FlowData)=>{value.edges[0].target='phase-1'},(value:FlowData)=>{value.viewport.zoom=2}]){const changed=structuredClone(original);mutate(changed);expect(flowsEqualForDirty(original,changed)).toBe(false)}
    expect(flowsEqualForDirty(original,structuredClone(original))).toBe(true)
  })
})
