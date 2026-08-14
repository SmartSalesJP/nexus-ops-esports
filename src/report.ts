import type { ReportSnapshot, Task } from './types'

export const sanitizeReportLine=(value:string)=>value.replace(/[\r\n\u2028\u2029]+/g,' ').replace(/[■◆#]/g,'').replace(/\s+/g,' ').trim()
const blockedBy=(task:Task,tasks:Task[])=>task.dependencies.filter((id)=>tasks.find((item)=>item.id===id)?.status!=='完了')
const within14=(task:Task,nowMs:number)=>{if(!task.deadlineDate||task.status==='完了')return false;const days=Math.ceil((Date.parse(`${task.deadlineDate}T00:00:00+09:00`)-nowMs)/86_400_000);return days>=0&&days<=14}

export function buildBiweeklyReport(tasks:Task[],baseline:ReportSnapshot|null,nowMs=Date.now()){
  const changed=baseline?tasks.filter((task)=>!baseline.statuses[task.id]||baseline.statuses[task.id].status!==task.status):[]
  const changedIds=new Set(changed.map((task)=>task.id))
  const blockedChanged=changed.filter((task)=>task.status==='保留'||blockedBy(task,tasks).length>0)
  const blockedIds=new Set(blockedChanged.map((task)=>task.id))
  const completed=changed.filter((task)=>task.status==='完了'&&!blockedIds.has(task.id))
  const progressing=changed.filter((task)=>task.status==='進行中'&&!blockedIds.has(task.id))
  const other=changed.filter((task)=>!blockedIds.has(task.id)&&task.status!=='完了'&&task.status!=='進行中')
  const upcoming=tasks.filter((task)=>!changedIds.has(task.id)&&within14(task,nowMs))
  const changeLine=(task:Task)=>{const before=baseline?.statuses[task.id]?.status??'新規',blocks=blockedBy(task,tasks),annotations=[`状態 ${before}→${task.status}`];if(blocks.length)annotations.push(`ブロック ${blocks.join('・')}完了待ち`);if(task.status==='保留')annotations.push(`保留理由 ${task.holdReason}`);if(within14(task,nowMs))annotations.push('次の2週間');return`・${task.id} ${sanitizeReportLine(task.title)}【${sanitizeReportLine(task.owner)}】【${annotations.map(sanitizeReportLine).join(' / ')}】`}
  const upcomingLine=(task:Task)=>`・${task.id} ${sanitizeReportLine(task.title)}【${sanitizeReportLine(task.owner)}】【状態 ${task.status} / 期限 ${sanitizeReportLine(task.deadline)}】`
  const lines=(items:Task[],formatter:(task:Task)=>string)=>items.length?items.map(formatter).join('\n'):'・該当なし'
  const text=`【NEXUS OPS 隔週進捗報告】\n比較基準: ${baseline?new Date(baseline.savedAt).toLocaleString('ja-JP'):'未保存'}\n\n■ 完了\n${lines(completed,changeLine)}\n\n■ 進行中\n${lines(progressing,changeLine)}\n\n■ 保留・ブロック\n${lines(blockedChanged,changeLine)}\n\n■ その他の状態変更\n${lines(other,changeLine)}\n\n■ 次の2週間\n${lines(upcoming,upcomingLine)}`
  return {changed,completed,progressing,blockedChanged,other,upcoming,text}
}
