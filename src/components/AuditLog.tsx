import { ClipboardCheck, Download } from 'lucide-react'
import type { AuditItem } from '../types'

// Shared with documentation tests; intentionally exported beside the view.
// eslint-disable-next-line react-refresh/only-export-components
export const auditToMarkdown=(items:AuditItem[])=>items.map((item)=>[
  `## ${item.issueId} ${item.action}`,
  `- 分類: ${item.classification}`,
  `- 対象版: ${item.targetVersion}`,
  `- round: ${item.round}`,
  `- 対象ファイル: ${item.files.join(', ')}`,
  `- before: ${item.before}`,
  `- after: ${item.after}`,
  `- 証拠: ${item.evidence.join(' / ')}`,
  `- 再試験: ${item.retest}`,
  `- 残留リスク: ${item.residualRisk}`,
].join('\n')).join('\n\n')

export function AuditLog({items}:{items:AuditItem[]}){
 const download=()=>{const url=URL.createObjectURL(new Blob([auditToMarkdown(items)],{type:'text/markdown;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='nexus-audit-log.md';anchor.click();URL.revokeObjectURL(url)}
 return <section aria-labelledby="audit-title"><div className="section-heading"><div><span className="eyebrow">REVISION TRACE</span><h2 id="audit-title">修正ログ / 監査履歴</h2><p>秘書向けに監査ID、証拠、再試験、残留リスクを構造化しています。</p></div><button className="button ghost" onClick={download}><Download size={16}/>Markdown保存</button></div><div className="audit-list">{items.length?items.map((item)=><article key={item.id}><div className="audit-icon"><ClipboardCheck size={18}/></div><div><time dateTime={item.at}>{item.at}</time><h3>{item.issueId} · {item.action}</h3><p>{item.detail}</p><dl className="audit-detail"><dt>分類 / 対象版 / round</dt><dd>{item.classification} / {item.targetVersion} / {item.round}</dd><dt>対象ファイル</dt><dd>{item.files.join(', ')}</dd><dt>before</dt><dd>{item.before}</dd><dt>after</dt><dd>{item.after}</dd><dt>証拠</dt><dd>{item.evidence.join(' / ')}</dd><dt>再試験</dt><dd>{item.retest}</dd><dt>残留リスク</dt><dd>{item.residualRisk}</dd></dl></div></article>):<div className="empty"><h3>履歴はまだありません</h3></div>}</div></section>
}
