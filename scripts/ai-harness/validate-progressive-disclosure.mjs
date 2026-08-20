#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateAuthorityContract } from "./validate-authority.mjs";
import { loadTokenizerContract } from "./tokenizer.mjs";
import {
  DEFAULT_REPO_ROOT,
  assertRepositoryPath,
  estimateContext,
  loadDisclosureState,
  renderDomain,
  renderOrientation,
  renderWorkflow,
} from "./show-context.mjs";

function array(value) { return Array.isArray(value) ? value : []; }
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
function duplicateValues(values) { const seen = new Set(); const duplicates = new Set(); for (const value of values) { if (seen.has(value)) duplicates.add(value); seen.add(value); } return [...duplicates].sort(); }

function existingRelativePath(rootDir, relativePath, errors, label) {
  try { assertRepositoryPath(rootDir, relativePath); return true; }
  catch (error) { errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); return false; }
}

function budgetLimit(budget) { return budget?.maxEstimatedTokens ?? budget?.maxAdditionalEstimatedTokens ?? null; }

export function validateBudgetException(exception, label, now = new Date()) {
  if (exception == null) return { approved: false, errors: [] };
  const errors = [];
  if (typeof exception !== "object" || Array.isArray(exception)) return { approved: false, errors: [`${label}: budgetException must be an object`] };
  const allowed = new Set(["kind", "bundle", "owner", "reason", "approvalRef", "expiresOn"]);
  for (const key of Object.keys(exception)) if (!allowed.has(key)) errors.push(`${label}: budgetException contains unknown field ${key}`);
  if (exception.kind !== "axtask.context-budget-exception.v1") errors.push(`${label}: budgetException.kind must be axtask.context-budget-exception.v1`);
  if (exception.bundle !== label) errors.push(`${label}: budgetException.bundle must equal ${label}`);
  if (!nonEmpty(exception.owner)) errors.push(`${label}: budgetException.owner is required`);
  if (!nonEmpty(exception.reason) || exception.reason.trim().length < 20) errors.push(`${label}: budgetException.reason must explain why a smaller authoritative split would be unsafe or misleading`);
  if (exception.approvalRef !== "axtask.agent-authority.v1") errors.push(`${label}: budgetException.approvalRef must equal axtask.agent-authority.v1`);
  if (typeof exception.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn)) {
    errors.push(`${label}: budgetException.expiresOn must be YYYY-MM-DD`);
  } else {
    const expires = new Date(`${exception.expiresOn}T23:59:59.999Z`);
    if (Number.isNaN(expires.getTime())) errors.push(`${label}: budgetException.expiresOn is invalid`);
    else if (expires.getTime() < now.getTime()) errors.push(`${label}: budgetException expired on ${exception.expiresOn}`);
  }
  return { approved: errors.length === 0, errors };
}

function checkBudget(label, rendered, budget, estimator, errors, measurements, exception, rootDir) {
  const measure = estimateContext(rendered, undefined, rootDir, estimator?.profileId);
  const limit = budgetLimit(budget);
  const exceptionResult = validateBudgetException(exception, label);
  const exceeded = Number.isInteger(limit) && measure.estimatedTokens > limit;
  measurements[label] = { ...measure, limit, exceptionApproved: exceeded && exceptionResult.approved };
  if (measure.measurement !== "exact-tokenization") errors.push(`${label}: measurement must be exact-tokenization`);
  if (measure.profileId !== estimator?.profileId) errors.push(`${label}: measured tokenizer profile ${String(measure.profileId)} does not match routed profile ${String(estimator?.profileId)}`);
  if (!Number.isInteger(limit)) return;
  if (!exceeded) {
    if (exception != null) errors.push(`${label}: budgetException is stale because the bundle is within its ${limit}-token ceiling`);
    return;
  }
  if (exception == null) {
    errors.push(`${label}: exact count ${measure.estimatedTokens} tokens exceeds soft ceiling ${limit} without a structured safety exception`);
    return;
  }
  errors.push(...exceptionResult.errors);
}

export function validateProgressiveDisclosure(rootDir = DEFAULT_REPO_ROOT) {
  const errors = []; const warnings = []; const measurements = {};
  const authority = validateAuthorityContract(rootDir); errors.push(...authority.errors.map((error) => `authority: ${error}`));
  let state; try { state = loadDisclosureState(rootDir); } catch (error) { return { errors: [`routing load failed: ${error instanceof Error ? error.message : String(error)}`], warnings, measurements }; }
  const routing = state.routing;
  if (routing.schemaVersion !== 1) errors.push(".ai/disclosure-map.json: schemaVersion must equal 1");
  if (routing.authorityRef !== authority.authorityId) errors.push(".ai/disclosure-map.json: authorityRef mismatch");
  if (routing.routingId !== "axtask.progressive-disclosure.v1") errors.push(".ai/disclosure-map.json: routingId mismatch");
  const estimator = routing.estimator ?? {};
  if (estimator.kind !== "exact-tokenizer" || estimator.registryPath !== ".ai/tokenizer-registry.json" || estimator.profileId !== "openai-o200k" || estimator.tokenizerAvailable !== true) {
    errors.push(".ai/disclosure-map.json: estimator must route exact tokenization through .ai/tokenizer-registry.json profile openai-o200k");
  }
  existingRelativePath(rootDir, estimator.registryPath, errors, "tokenizer registry");
  try {
    const { registry, profile, backend } = loadTokenizerContract(rootDir, estimator.profileId);
    if (registry.authorityRef !== authority.authorityId) errors.push("tokenizer registry authorityRef mismatch");
    if (registry.canonicalGeneralBackendId !== "huggingface-tokenizers") errors.push("tokenizer registry must designate huggingface-tokenizers as the canonical general backend");
    const general = array(registry.backends).find((item) => item?.id === registry.canonicalGeneralBackendId);
    if (general?.repository !== "huggingface/tokenizers" || general?.status !== "canonical-general") errors.push("canonical general tokenizer backend must be huggingface/tokenizers");
    if (backend.repository !== "openai/tiktoken" || backend.status !== "active-context-counting") errors.push("active context tokenizer backend must be openai/tiktoken");
    if (profile.encoding !== "o200k_base" || profile.measurement !== "exact-tokenization") errors.push("openai-o200k profile must use exact o200k_base tokenization");
    existingRelativePath(rootDir, backend.runner, errors, "tokenizer backend runner");
    const requirementsPath = "scripts/ai-harness/tokenizer-requirements.txt";
    if (existingRelativePath(rootDir, requirementsPath, errors, "tokenizer requirements")) {
      const requirements = fs.readFileSync(path.join(rootDir, requirementsPath), "utf8");
      if (!requirements.split(/\r?\n/).some((line) => line.trim() === `${backend.package?.name}==${backend.package?.version}`)) {
        errors.push("tokenizer requirements must pin the registry package name and version exactly");
      }
    }
  } catch (error) {
    errors.push(`tokenizer contract failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contractValidator = routing.validator ?? {};
  if (contractValidator.id !== "progressive-disclosure") errors.push("disclosure validator id must be progressive-disclosure");
  if (contractValidator.command !== "node scripts/ai-harness/validate-progressive-disclosure.mjs") errors.push("disclosure validator command mismatch");
  for (const [label, routedPath] of [["contract test", contractValidator.contractTest], ["CI workflow", contractValidator.ciWorkflow]]) existingRelativePath(rootDir, routedPath, errors, `disclosure ${label}`);

  const orientationBudget = routing.budgets?.orientation; const domainBudget = routing.budgets?.domain; const workflowBudget = routing.budgets?.workflow;
  if (budgetLimit(orientationBudget) !== 1000) errors.push("orientation budget must be 1000 tokens");
  if (budgetLimit(domainBudget) !== 2000) errors.push("domain budget must be 2000 additional tokens");
  if (budgetLimit(workflowBudget) !== 4000) errors.push("workflow budget must be 4000 additional tokens");
  const defaultPaths = array(routing.orientation?.defaultLoadPaths);
  if (defaultPaths.length !== 1 || defaultPaths[0] !== ".ai/README.md") errors.push("50k orientation must load only .ai/README.md by default");
  for (const p of defaultPaths) existingRelativePath(rootDir, p, errors, "orientation");
  for (const p of array(routing.orientation?.governanceBeforeMutation)) existingRelativePath(rootDir, p, errors, "governance");
  existingRelativePath(rootDir, routing.orientation?.coordinationPath, errors, "coordination");
  if (!nonEmpty(routing.orientation?.coordinationLoadWhen)) errors.push("coordinationPath requires an explicit load condition");
  const forbiddenDefaultPrefixes = array(routing.onDemandOnlyPrefixes);
  if (forbiddenDefaultPrefixes.length === 0) errors.push("onDemandOnlyPrefixes must enumerate demand-loaded resource families");
  for (const p of defaultPaths) if (forbiddenDefaultPrefixes.some((prefix) => p.startsWith(prefix))) errors.push(`50k orientation illegally preloads ${p}`);
  try { checkBudget("orientation", renderOrientation(state), orientationBudget, estimator, errors, measurements, routing.orientation?.budgetException, rootDir); } catch (error) { errors.push(`orientation render failed: ${error instanceof Error ? error.message : String(error)}`); }

  const validatorIds = new Set(array(state.validatorRegistry?.validators).map((item) => item?.id).filter(nonEmpty));
  const artifactIds = new Set(array(state.artifactRegistry?.artifacts).map((item) => item?.id).filter(nonEmpty));
  const domains = array(routing.domains); const domainIds = domains.map((item) => item?.id).filter(nonEmpty);
  for (const duplicate of duplicateValues(domainIds)) errors.push(`duplicate domain id ${duplicate}`);
  for (const domain of domains) {
    if (!nonEmpty(domain?.id) || !nonEmpty(domain?.loadWhen)) errors.push("every domain requires id and loadWhen");
    if (!existingRelativePath(rootDir, domain?.path, errors, `domain ${domain?.id ?? "unknown"}`)) continue;
    if (!domain.path.startsWith(".ai/domains/")) errors.push(`domain ${domain.id} must live under .ai/domains/`);
    for (const owner of array(domain.ownerRefs)) { if (!nonEmpty(owner?.loadWhen)) errors.push(`domain ${domain.id}: ownerRef requires loadWhen`); existingRelativePath(rootDir, owner?.path, errors, `domain ${domain.id} ownerRef`); }
    for (const workflowId of array(domain.workflowIds)) if (!array(routing.workflowRoutes).some((route) => route?.workflowId === workflowId && route?.domainId === domain.id)) errors.push(`domain ${domain.id}: workflow ${workflowId} is not routed back to this domain`);
    for (const id of array(domain.validatorIds)) if (!validatorIds.has(id)) errors.push(`domain ${domain.id}: unknown validator ${id}`);
    for (const id of array(domain.artifactIds)) if (!artifactIds.has(id)) errors.push(`domain ${domain.id}: unknown artifact ${id}`);
    try { const rendered = renderDomain(state, domain.id); checkBudget(`domain:${domain.id}`, rendered, domainBudget, estimator, errors, measurements, domain.budgetException, rootDir); for (const other of domains) if (other.id !== domain.id && rendered.includes(other.path)) errors.push(`domain ${domain.id} embeds unrelated domain map ${other.path}`); } catch (error) { errors.push(`domain ${domain.id} render failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  const workflowRecords = array(state.workflowRegistry?.workflows); const workflowIds = workflowRecords.map((item) => item?.id).filter(nonEmpty); const routes = array(routing.workflowRoutes); const routeIds = routes.map((item) => item?.workflowId).filter(nonEmpty);
  for (const duplicate of duplicateValues(routeIds)) errors.push(`duplicate workflow route ${duplicate}`);
  for (const workflowId of workflowIds) if (routeIds.filter((id) => id === workflowId).length !== 1) errors.push(`workflow ${workflowId} must have exactly one 15k route`);
  for (const routeId of routeIds) if (!workflowIds.includes(routeId)) errors.push(`workflow route references unknown workflow ${routeId}`);
  const domainIdSet = new Set(domainIds);
  for (const route of routes) {
    const label = `workflow:${route?.workflowId ?? "unknown"}`;
    if (!domainIdSet.has(route?.domainId)) errors.push(`${label}: unknown domain ${String(route?.domainId)}`);
    for (const p of [...array(route.skillPaths), ...array(route.contractPaths), ...array(route.schemaPaths)]) existingRelativePath(rootDir, p, errors, label);
    for (const conditional of array(route.conditionalLoads)) { if (!nonEmpty(conditional?.when)) errors.push(`${label}: conditional load requires when`); for (const p of array(conditional?.paths)) existingRelativePath(rootDir, p, errors, `${label} conditional`); }
    for (const id of array(route.validatorIds)) if (!validatorIds.has(id)) errors.push(`${label}: unknown validator ${id}`);
    for (const id of array(route.artifactIds)) if (!artifactIds.has(id)) errors.push(`${label}: unknown artifact ${id}`);
    try { checkBudget(label, renderWorkflow(state, route.workflowId), workflowBudget, estimator, errors, measurements, route.budgetException, rootDir); } catch (error) { errors.push(`${label} render failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const [name, p] of Object.entries(routing.sharedWorkflowContracts ?? {})) existingRelativePath(rootDir, p, errors, `shared workflow contract ${name}`);
  const agents = fs.readFileSync(path.join(rootDir, "AGENTS.md"), "utf8");
  for (const anchor of ["## Canonical operating authority","AGENT_GUARDRAILS.md","`replit.md` is an architecture snapshot, not deployment authority",".ai/authority.json","authorityRef: axtask.agent-authority.v1",".ai/harness.json","node scripts/ai-harness/show-context.mjs domain <id>","node scripts/ai-harness/show-context.mjs workflow <id>"]) if (!agents.includes(anchor)) errors.push(`AGENTS.md lost authority/routing anchor: ${anchor}`);
  return { authorityId: authority.authorityId, routingId: routing.routingId, errors, warnings, measurements };
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REPO_ROOT; const result = validateProgressiveDisclosure(rootDir);
  if (result.errors.length > 0) { console.error(`[progressive-disclosure] FAIL routing=${result.routingId ?? "unknown"}`); for (const error of result.errors) console.error(`- ${error}`); process.exitCode = 1; return; }
  const orientation = result.measurements.orientation;
  const maxDomain = Math.max(...Object.entries(result.measurements).filter(([key]) => key.startsWith("domain:")).map(([, value]) => value.estimatedTokens));
  const maxWorkflow = Math.max(...Object.entries(result.measurements).filter(([key]) => key.startsWith("workflow:")).map(([, value]) => value.estimatedTokens));
  console.log(`[progressive-disclosure] PASS orientation=${orientation.estimatedTokens} max-domain=${maxDomain} max-workflow=${maxWorkflow} exact-tokens (${orientation.backend} ${orientation.encoding})`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
