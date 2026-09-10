# AI Intent Eval Report

- Pack: `{{packId}}`
- Generated: `{{generatedAt}}`
- Gating: `{{gatingPassed}}/{{gatingCases}}` (passRate={{gatingPassRate}})
- Threshold met: `{{thresholdMet}}`
- Live enabled: `{{liveEnabled}}`

## Failures

{{#failures}}
- `{{caseId}}` ({{failureClass}}): {{criterionFailures}}
{{/failures}}

## Proof ceiling

Offline fixture/rule_parser only unless `AXTASK_AI_EVAL_LIVE=1` was set with operator authorization.
