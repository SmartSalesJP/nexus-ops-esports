import type { ChecklistItem, Task, TaskResultSheet } from './types'

type TemplateRow={title:string;acceptanceCriteria:string}
const W33_TEMPLATES:Record<string,TemplateRow[]>={
  'P0-01':[
    {title:'YUKISHIROさんへ開催時期変更を連絡する',acceptanceCriteria:'3月開催への変更と旧期限超過を明記した連絡内容が確認できる'},
    {title:'3月の候補日を再打診する',acceptanceCriteria:'候補日と回答期限を含む打診内容が確認できる'},
    {title:'返答と次の対応を共有する',acceptanceCriteria:'返答内容、未回答時の再連絡日、次の担当が共有されている'},
  ],
  'P0-02':[
    {title:'スタッフ派遣の必要条件を確認する',acceptanceCriteria:'8/22-23の必要人数、時間、役割、場所が確認できる'},
    {title:'派遣可否を最終確定する',acceptanceCriteria:'派遣可否と確定日が記録されている'},
    {title:'派遣スタッフの手配を完了する',acceptanceCriteria:'氏名、役割、集合時刻、連絡方法が当事者に共有されている'},
  ],
  'P0-04':[
    {title:'責任者再編案をLINEグループに提示する',acceptanceCriteria:'各領域の責任者と役割を含む提示内容が確認できる'},
    {title:'関係者の合意を確認する',acceptanceCriteria:'異論または修正事項が整理され、最終合意が確認できる'},
    {title:'合意済み体制を進行表に反映する',acceptanceCriteria:'合意内容と進行表の責任者表記が一致している'},
  ],
  'P0-05':[
    {title:'タスク進行表に全タスクを登録する',acceptanceCriteria:'正本タスクのID、担当、期限、状態を確認できる'},
    {title:'更新・検索・保存動作を確認する',acceptanceCriteria:'タスク更新、検索、保存後の再読込みがエラーなく完了する'},
    {title:'全員に利用方法と参照先を共有する',acceptanceCriteria:'対象者、共有先、更新ルールを確認できる'},
  ],
  'P0-06':[
    {title:'隔週進捗報告テンプレートを作成する',acceptanceCriteria:'進捗、課題、次回アクション、担当、期限の欄がある'},
    {title:'初回報告日と以降の隔週日程を決める',acceptanceCriteria:'初回日時、繰り返し周期、報告担当が確定している'},
    {title:'LINE共有の実施手順を確認する',acceptanceCriteria:'作成、確認、送信、修正依頼の担当と手順が共有されている'},
  ],
}

const make=(taskId:string,rows:TemplateRow[],assignee:string):ChecklistItem[]=>rows.map((row,index)=>({id:`checklist:${taskId}:${index+1}`,title:row.title,status:'未着手',acceptanceCriteria:row.acceptanceCriteria,assignee,reviewer:'',reviewedAt:'',evidenceMemo:'',holdReason:''}))
export function checklistTemplate(task:Task,sourceTask?:Task):ChecklistItem[]{
  const source=sourceTask??task,assignee=source.rawAssignees||source.owner,known=W33_TEMPLATES[source.id]
  if(known)return make(task.id,known,assignee)
  return make(task.id,[
    {title:`${source.title}の実施内容を確定する`,acceptanceCriteria:`対象、担当、期限、完了条件が「${source.title}」と整合している`},
    {title:`${source.title}を実施する`,acceptanceCriteria:`「${source.title}」の完了条件を確認し、実施結果の証跡と確認者を登録できる`},
    {title:'実施結果を確認し、次工程へ共有する',acceptanceCriteria:'確認者、確認日時、証跡メモが実績に基づき記録されている'},
  ],assignee)
}

export const isMilestoneChecklist=(task:Task)=>task.provenance?.ruleId==='milestone-checklist'
export const checklistProgress=(items:ChecklistItem[]|undefined)=>({completed:(items??[]).filter((item)=>item.status==='完了').length,total:items?.length??0})
const visible=(value:unknown)=>typeof value==='string'&&value.replace(/[\s\u200b-\u200d\ufeff]/gu,'').length>0
export function milestoneCompletionIssues(task:Task,result?:TaskResultSheet){
  if(!isMilestoneChecklist(task))return[]
  const issues:string[]=[],items=result?.checklistItems
  if(!items?.length)return['構造化チェックリストを1件以上登録してください。']
  if(result?.verificationState!=='適合')issues.push('全体確認の確認状態を「適合」にしてください。')
  const ids=new Set<string>()
  items.forEach((item,index)=>{const label=`項目${index+1}`;if(!visible(item.id)||ids.has(item.id))issues.push(`${label}の安定IDが不正です。`);ids.add(item.id);if(item.status!=='完了')issues.push(`${label}は未完了（${item.status}）です。`);if(!visible(item.title))issues.push(`${label}の実施項目が必要です。`);if(!visible(item.acceptanceCriteria))issues.push(`${label}の受入条件が必要です。`);if(!visible(item.reviewer))issues.push(`${label}の確認者が必要です。`);if(!item.reviewedAt||Number.isNaN(Date.parse(item.reviewedAt)))issues.push(`${label}の確認日時が必要です。`);if(!visible(item.evidenceMemo))issues.push(`${label}の証跡メモが必要です。`)})
  return issues
}

export function milestoneStatusTransitionIssues(previous:Task|undefined,candidate:Task,result?:TaskResultSheet){
  if(candidate.status!=='完了'||previous?.status==='完了')return[]
  return milestoneCompletionIssues(candidate,result)
}
