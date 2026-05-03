# Clarification Protocol

## Purpose

Ensure report generation never proceeds on weak assumptions when ambiguity can be resolved through focused user questions.

## Mandatory Clarification Triggers

Ask questions before drafting when any of the following is unknown:

- primary objective of the report,
- intended audience,
- time window or dataset scope,
- required depth and format,
- acceptable confidence threshold,
- privacy and sharing constraints.

## Question Design Rules

- Ask the minimum set needed to unblock quality output.
- Prefer short, binary-or-choice prompts first.
- Confirm defaults explicitly before using them.
- Reflect constraints back to the user before drafting.

## Proceed Criteria

Proceed only after:

1. objective and audience are known,
2. scope and timeframe are explicit,
3. evidence requirements are clear or defaults accepted,
4. privacy constraints are acknowledged.

## Safety and UX Guardrails

- Never present uncertain claims as facts.
- Mark assumptions and confidence clearly.
- If unanswered critical ambiguity remains, keep asking instead of drafting.
