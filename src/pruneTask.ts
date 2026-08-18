import type { ExportBundle, Task } from './types'

const referencesTask=(task:Task,removed:Set<string>)=>task.createdByDepartment==='esports_progress_control'&&!!task.provenance&&((!!task.provenance.sourceTaskId&&removed.has(task.provenance.sourceTaskId))||task.provenance.dependencyIds.some((id)=>removed.has(id)))

export function pruneTaskReferences(bundle:ExportBundle,taskId:string):ExportBundle{
  const removed=new Set([taskId]);let changed=true
  while(changed){changed=false;for(const task of bundle.tasks)if(!removed.has(task.id)&&referencesTask(task,removed)){removed.add(task.id);changed=true}}
  const tasks=bundle.tasks.filter((task)=>!removed.has(task.id)).map((task)=>({...task,dependencies:task.dependencies.filter((id)=>!removed.has(id))})),taskResults=(bundle.taskResults??[]).filter((result)=>!removed.has(result.taskId)),completions={...bundle.weekly.completions};for(const id of removed)delete completions[id]
  const nodes=bundle.flow.nodes.flatMap((node)=>{const data=node.data as Record<string,unknown>,task=typeof data.taskId==='string'?data.taskId:'',target=data.targetType==='task'&&typeof data.targetId==='string'?data.targetId:'',managed=[...removed].some((id)=>node.id===`weekly-complete:${id}`||node.id===`weekly-project:task:${id}`);if(managed||removed.has(task)||removed.has(target))return[];if(!Array.isArray(data.taskIds))return[node];return[{...node,data:{...data,taskIds:data.taskIds.filter((id)=>typeof id==='string'&&!removed.has(id))}}]}),nodeIds=new Set(nodes.map((node)=>node.id)),edges=bundle.flow.edges.flatMap((edge)=>{if(!nodeIds.has(edge.source)||!nodeIds.has(edge.target))return[];const data=edge.data as Record<string,unknown>|undefined,task=typeof data?.taskId==='string'?data.taskId:'',target=data?.targetType==='task'&&typeof data.targetId==='string'?data.targetId:'';if(removed.has(task)||removed.has(target))return[];if(!Array.isArray(data?.taskIds))return[edge];return[{...edge,data:{...data,taskIds:data.taskIds.filter((id)=>typeof id==='string'&&!removed.has(id))}}]})
  return{...bundle,tasks,taskResults,flow:{...bundle.flow,nodes,edges},weekly:{...bundle.weekly,completions}}
}
