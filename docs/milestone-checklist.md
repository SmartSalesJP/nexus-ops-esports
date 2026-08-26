# Milestone checklist result sheets

Tasks whose `provenance.ruleId` is `milestone-checklist` use the existing
`#task-result/<taskId>` route and the existing `task_result` cloud entity. Schema
v4 remains unchanged. `TaskResultSheet.checklistItems` is optional so v2/v3
migrations and v4 results saved before this feature continue to load.

Each ordered item contains a stable `id`, implementation title, status
(`未着手` / `進行中` / `完了` / `保留`), acceptance criteria, assignee,
reviewer, reviewed timestamp, evidence memo, and hold reason. The array order is
meaningful and is preserved by local JSON, import/export, semantic cloud diff,
and cloud read-back.

An uninitialized milestone sheet previews a suggested template and requires an
explicit choice between using it and starting empty. P0-01, P0-02, P0-04,
P0-05, and P0-06 have reviewed W33 templates. Later tasks derive their wording
from the source P task title and completion criteria, with a conservative
evidence-and-review fallback; they do not reuse AUTO `expectedDeliverable` text. Templates always start as
`未着手`; they never populate reviewers, timestamps, evidence, or execution results.

Validation requires non-blank titles and acceptance criteria for every item.
Completed items additionally require reviewer, reviewed timestamp, and evidence
memo. Held items require a non-blank hold reason. URLs remain confined to the
existing deliverables collection and retain the HTTPS-only policy.

Saving a checklist only upserts its `task_result` and an existing
`OP-TASK-RESULT` audit entry. It does not change the source P task or the AUTO
task status. A milestone AUTO task can be changed to `完了` only after it has at
least one structured checklist item, every item is `完了` with its required
review fields and evidence, and the overall verification state is `適合`.
Existing inconsistent completed tasks are shown with a warning without being
mutated automatically, and can be moved away from `完了` for correction.

`20260818181229_add_task_result_checklist.sql` extends only the JSON payload
validator. It does not add tables, entity types, links, grants, RLS policies,
Auth behavior, or RPC signatures.
