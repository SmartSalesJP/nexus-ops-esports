import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialNodes, initialEdges, initialViewport, initialTasks } from '../data'
import { ProjectCanvas } from './ProjectCanvas'

describe('ProjectCanvas viewer interaction',()=>{
  it('allows mouse and keyboard zoom without reporting persistent dirty state',async()=>{const dirty=vi.fn();render(<ProjectCanvas initialFlow={{nodes:initialNodes,edges:initialEdges,viewport:initialViewport}} tasks={initialTasks} readOnly onDirty={dirty} onSave={vi.fn()}/>);const zoom=screen.getByRole('button',{name:/zoom in/i});await userEvent.click(zoom);zoom.focus();await userEvent.keyboard('{Enter}');expect(dirty).not.toHaveBeenCalledWith(true)})
  it('supports viewer pan, MiniMap, touch and focused-node result navigation without dirtying',()=>{const dirty=vi.fn(),open=vi.fn(),flow={nodes:[{id:'viewer-task',position:{x:0,y:0},data:{label:'viewer task',taskId:'P0-01'}}],edges:[],viewport:{x:0,y:0,zoom:1}};const {container}=render(<ProjectCanvas initialFlow={flow} tasks={initialTasks} readOnly onDirty={dirty} onOpenResult={open} onSave={vi.fn()}/>),pane=container.querySelector('.react-flow__pane')!,node=container.querySelector<HTMLElement>('[data-id="viewer-task"]')!,map=container.querySelector('.react-flow__minimap')!;expect(map).toBeInTheDocument();fireEvent.pointerDown(pane,{pointerId:1,clientX:120,clientY:120,button:0});fireEvent.pointerMove(pane,{pointerId:1,clientX:170,clientY:160});fireEvent.pointerUp(pane,{pointerId:1,clientX:170,clientY:160});fireEvent.touchStart(pane,{touches:[{clientX:100,clientY:100}]});fireEvent.touchMove(pane,{touches:[{clientX:130,clientY:120}]});fireEvent.touchEnd(pane);fireEvent.click(map);node.focus();fireEvent.keyDown(node,{key:'Enter'});expect(open).toHaveBeenCalledWith('P0-01');expect(dirty).not.toHaveBeenCalledWith(true)})
})
