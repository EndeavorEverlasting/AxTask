# AxTask Billing Bridge GUI Spec

## Mission
Build the operator GUI and workflow orchestration surface.
AxTask is the cockpit. Keep the engine room behind bulkhead doors.

## Responsibilities
- Let user pick month.
- Let user upload/select Paylocity PDFs.
- Let user select billing workbook.
- Show pipeline stage status.
- Show confidence warnings.
- Generate final email/subject using LLM.
- Store reusable monthly task templates.
- Expose "Run Billing Bridge" from an admin/workflow dashboard.

## GUI Screens

### 1. Billing Bridge Dashboard
Fields:
- Month
- Project / PO
- Input folder
- Workbook candidate
- Run status
- Last validation result

### 2. Upload / Select Sources
Accept:
- Paylocity PDFs
- Invoice DOCX/PDFs
- Billing summary workbook
- Attendance workbook
- Invoice ZIP bundle

### 3. Review Queue
Show rows like:
- File
- Detected Type
- Confidence
- Action

### 4. Run Pipeline
Stages:
1. Classify files
2. Parse sources
3. Normalize ledgers
4. Update workbook
5. Validate Web Excel
6. Generate email packet

### 5. Email Draft Output
AxTask sends only clean packet data to the LLM:
```json
{
  "month": "April 2026",
  "status": "workbook validated",
  "attachments": [
    "CANDIDATE_April_2026_Billing_Bridge_WEBSAFE.xlsx"
  ],
  "exceptions": [],
  "requested_outputs": [
    "subject",
    "email_body"
  ]
}
```

## Definition of Done
- User can select a month.
- User can upload/select files.
- User can see classification results.
- User can start a pipeline run.
- User can see output artifacts.
- User can generate email subject/body from a safe packet.

## Constraints
- Do not parse PDFs deeply in the UI.
- Do not mutate Excel directly in React.
- Do not trust LLM math.
