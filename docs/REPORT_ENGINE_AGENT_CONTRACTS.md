# Report Engine and Agent Contracts

## Purpose

Define how AxTask engines and agents produce reports that help users complete work, not only observe work.

## Engine Suite

- **Draft Engine**: Generates a direct first draft when confidence and scope are high.
- **Guided Interview Engine**: Asks clarifying questions first when ambiguity is present.
- **Evidence Synthesis Engine**: Builds final report structure using retrieved evidence and classification signals.
- **Style Adapter Engine**: Adapts tone/format for the requested audience.

## Agent Lifecycle Contract

1. Intent detection and report-type classification.
2. Ambiguity gate check.
3. Clarification phase when required.
4. Retrieval and reranking.
5. Draft generation.
6. Evidence verification and privacy check.
7. Delivery with confidence and assumptions summary.

## Ambiguity Gate

Agents must pause and ask questions when one or more is missing:

- report objective,
- target audience,
- timeframe and scope,
- evidence requirements,
- tone/format constraints.

## Fallback Rules

- If retrieval confidence is low, degrade to interview mode.
- If classification confidence is low, ask route-confirmation questions.
- If privacy checks fail, block publication and request user action.
