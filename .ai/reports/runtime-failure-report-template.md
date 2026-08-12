authorityRef: axtask.agent-authority.v1

# Runtime failure report

## SUMMARY

- Candidate SHA: `{{candidateSha}}`
- Source proof: `{{sourceProof}}`
- Status: `{{status}}`
- Classification: `{{classification}}`
- Attained proof: `{{attainedProofLevel}}`
- Proof ceiling: `{{proofCeiling}}`

## PRIMARY FAILURE

{{primaryFailure}}

## FAILED ASSERTIONS

{{failedAssertions}}

## RECORDED FAILURES

{{failures}}

## RECOVERY

- Workflow: `{{nextWorkflow}}`
- Retry policy: `{{retryPolicy}}`

Do not include raw logs, commands, connection strings, credentials, or assertion evidence in this report. Repair or reproduce the primary failure before rerunning the complete runtime certification unchanged.
