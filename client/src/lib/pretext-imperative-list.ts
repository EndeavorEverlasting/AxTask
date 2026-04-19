/**
 * PretextImperativeList — React-free row renderer for the /tasks page.
 *
 * The legacy `TaskList` renders 1 React subtree per row (framer-motion layout,
 * dnd-kit `useSortable`, ClassificationBadge with several `useQuery`s, plus
 * AnimatePresence wrapping the whole body). At 30 rows the non-virtualized
 * path stalls scrolling for ~1s. This controller owns the `<tbody>` directly:
 *
 *  - **Keyed DOM diff.** `setTasks(tasks)` diffs the incoming task array
 *    against the current row map (keyed by `task.id`) and patches only the
 *    text nodes / data-attrs that changed. No innerHTML, no virtual DOM.
 *  - **Row template.** New rows are cloned from a single `<template>` element
 *    (one parser pass per app lifetime instead of per row).
 *  - **Event delegation.** A single set of listeners on `<tbody>` reads
 *    `data-task-id` + `data-action` from the closest ancestor. Row handlers
 *    scale O(1) with row count.
 *  - **Windowing without react-virtual.** Rows carry `axtask-cv-row` so the
 *    browser skips layout/paint for offscreen rows via `content-visibility`.
 *  - **Perf ledger integration.** Every `setTasks` writes a `task-list`
 *    `update` mark with elapsed ms + row count so the admin panel can attribute
 *    cost to this surface.
 *
 * Not a replacement for the entire legacy component — sort, filter, search,
 * classification popover, and write-path dialogs remain React-owned. The
 * controller is the *render hot path*.
 */

import { perfLedger, type PerfLedger } from "./perf-ledger";

export type TaskRowStatus = "pending" | "in-progress" | "completed";

export interface ImperativeRowTask {
  id: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  priority: string;
  activity: string;
  notes: string;
  classification: string;
  classificationExtraCount: number;
  priorityScoreTenths: number;
  status: TaskRowStatus;
  recurrence: string | null;
}

export type RowAction =
  | "open"
  | "toggle-status"
  | "delete"
  | "classify"
  | "drag-handle";

export interface RowEvent {
  taskId: string;
  action: RowAction;
  target: HTMLElement;
  original: Event;
}

export interface PretextImperativeListOptions {
  ledger?: PerfLedger;
  surface?: string;
  /** Mark `data-axtask-surface` on the tbody so long-task attribution works. */
  tagSurface?: boolean;
  /** Defaults to `false`. When true, a drag-handle cell is rendered per row. */
  dragMode?: boolean;
  /** Invoked for every `data-action` click inside the tbody. */
  onRowEvent: (ev: RowEvent) => void;
}

type RowBinding = {
  el: HTMLTableRowElement;
  dateText: Text;
  dateRecurrence: HTMLElement;
  createdText: Text;
  updatedText: Text;
  priority: HTMLElement;
  activity: HTMLElement;
  notes: HTMLElement;
  classification: HTMLElement;
  classificationExtra: HTMLElement;
  priorityScore: Text;
  statusBadge: HTMLElement;
  currentStatus: TaskRowStatus;
};

const TEMPLATE_ID = "axtask-imperative-row-template";

/**
 * Per-document cache of the parsed row template so we only pay the HTML
 * parse once per app lifetime instead of once per PretextImperativeList
 * instance. Keyed by Document (WeakMap) so tests that swap out jsdom
 * windows don't accidentally reuse a template from a detached document.
 */
const TEMPLATE_CACHE = new WeakMap<Document, HTMLTemplateElement>();

/**
 * Browsers parse `<template>.innerHTML = "<tr>..."` using the "in body"
 * insertion mode by default, which DROPS orphan `<tr>` tokens and leaves
 * the `<td>` children to appear as loose inline text — this is the root
 * cause of the "Repeat / Ship chips floating with no row" regression.
 *
 * The HTML-spec-blessed fix is to parse the row inside a real table context
 * and then extract the `<tr>` from the parsed subtree. That keeps the HTML
 * parser in "in table body" insertion mode so the row is preserved intact.
 *
 * We do NOT append the template to document.body (the previous behavior),
 * because doing so left an id-colliding element in the page that broke
 * subsequent remounts after fast-refresh / HMR in dev and exposed template
 * internals to a11y / DOM test tooling.
 */
function ensureTemplate(doc: Document): HTMLTemplateElement {
  const cached = TEMPLATE_CACHE.get(doc);
  if (cached) return cached;
  const rowHtml = `
<tr class="axtask-cv-row hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" data-action="open">
  <td class="axtask-drag-cell hidden w-8" data-action="drag-handle">
    <button type="button" class="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded" data-action="drag-handle" aria-label="Drag">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 4h2v2H9zm4 0h2v2h-2zM9 8h2v2H9zm4 0h2v2h-2zM9 12h2v2H9zm4 0h2v2h-2zM9 16h2v2H9zm4 0h2v2h-2zM9 20h2v2H9zm4 0h2v2h-2z"/></svg>
    </button>
  </td>
  <td class="font-mono text-sm">
    <span class="axtask-cell-date"></span>
    <span class="axtask-cell-recurrence hidden ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"></span>
  </td>
  <td class="max-w-[140px] font-mono text-xs text-muted-foreground whitespace-nowrap axtask-cell-created"></td>
  <td class="max-w-[140px] font-mono text-xs text-muted-foreground whitespace-nowrap axtask-cell-updated"></td>
  <td><span class="axtask-cell-priority inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"></span></td>
  <td class="max-w-md">
    <div class="axtask-cell-activity truncate"></div>
    <div class="axtask-cell-notes text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 hidden"></div>
  </td>
  <td>
    <div class="flex items-center gap-1.5">
      <button type="button" class="axtask-cell-classification inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" data-action="classify"></button>
      <span class="axtask-cell-classification-extra text-[10px] text-muted-foreground hidden"></span>
    </div>
  </td>
  <td class="font-mono text-sm axtask-cell-priority-score"></td>
  <td>
    <span class="axtask-cell-status inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"></span>
  </td>
  <td>
    <div class="flex space-x-2">
      <button type="button" class="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" data-action="toggle-status" aria-label="Toggle status">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M5 12l4 4L19 6"/></svg>
      </button>
      <button type="button" class="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" data-action="delete" aria-label="Delete">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M4 7h16M9 7V4h6v3m-8 0l1 13h10l1-13"/></svg>
      </button>
    </div>
  </td>
</tr>
`.trim();

  const scratch = doc.createElement("template");
  scratch.innerHTML = `<table><tbody>${rowHtml}</tbody></table>`;
  const parsedRow = scratch.content.querySelector("tr");
  if (!parsedRow) {
    throw new Error(
      "PretextImperativeList: failed to parse row template (no <tr> after <table><tbody> wrap)",
    );
  }
  const rowTemplate = doc.createElement("template");
  rowTemplate.id = TEMPLATE_ID;
  rowTemplate.content.appendChild(parsedRow);
  TEMPLATE_CACHE.set(doc, rowTemplate);
  return rowTemplate;
}

function priorityClasses(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "high" || p === "urgent") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (p === "medium" || p === "med") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200";
}

function statusClasses(status: TaskRowStatus): string {
  if (status === "completed") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (status === "in-progress") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
}

function formatStatusLabel(status: TaskRowStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ");
}

function bindRow(el: HTMLTableRowElement): RowBinding {
  return {
    el,
    dateText: el.querySelector<HTMLElement>(".axtask-cell-date")!.appendChild(document.createTextNode("")),
    dateRecurrence: el.querySelector<HTMLElement>(".axtask-cell-recurrence")!,
    createdText: el.querySelector<HTMLElement>(".axtask-cell-created")!.appendChild(document.createTextNode("")),
    updatedText: el.querySelector<HTMLElement>(".axtask-cell-updated")!.appendChild(document.createTextNode("")),
    priority: el.querySelector<HTMLElement>(".axtask-cell-priority")!,
    activity: el.querySelector<HTMLElement>(".axtask-cell-activity")!,
    notes: el.querySelector<HTMLElement>(".axtask-cell-notes")!,
    classification: el.querySelector<HTMLElement>(".axtask-cell-classification")!,
    classificationExtra: el.querySelector<HTMLElement>(".axtask-cell-classification-extra")!,
    priorityScore: el.querySelector<HTMLElement>(".axtask-cell-priority-score")!.appendChild(
      document.createTextNode(""),
    ),
    statusBadge: el.querySelector<HTMLElement>(".axtask-cell-status")!,
    currentStatus: "pending",
  };
}

function applyRow(binding: RowBinding, task: ImperativeRowTask): void {
  const el = binding.el;
  if (el.dataset.taskId !== task.id) {
    el.dataset.taskId = task.id;
  }
  if (binding.dateText.data !== task.date) binding.dateText.data = task.date;
  if (task.recurrence && task.recurrence !== "none") {
    binding.dateRecurrence.textContent = task.recurrence;
    binding.dateRecurrence.classList.remove("hidden");
  } else if (!binding.dateRecurrence.classList.contains("hidden")) {
    binding.dateRecurrence.classList.add("hidden");
    binding.dateRecurrence.textContent = "";
  }
  if (binding.createdText.data !== task.createdAt) binding.createdText.data = task.createdAt;
  if (binding.updatedText.data !== task.updatedAt) binding.updatedText.data = task.updatedAt;

  const priorityClass = priorityClasses(task.priority);
  const priorityDesired = `axtask-cell-priority inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityClass}`;
  if (binding.priority.className !== priorityDesired) binding.priority.className = priorityDesired;
  if (binding.priority.textContent !== task.priority) binding.priority.textContent = task.priority;

  if (binding.activity.textContent !== task.activity) binding.activity.textContent = task.activity;
  if (task.notes) {
    binding.notes.classList.remove("hidden");
    if (binding.notes.textContent !== task.notes) binding.notes.textContent = task.notes;
  } else {
    binding.notes.classList.add("hidden");
    binding.notes.textContent = "";
  }

  if (binding.classification.textContent !== task.classification) {
    binding.classification.textContent = task.classification;
  }
  if (task.classificationExtraCount > 0) {
    binding.classificationExtra.classList.remove("hidden");
    binding.classificationExtra.textContent = `+${task.classificationExtraCount}`;
  } else if (!binding.classificationExtra.classList.contains("hidden")) {
    binding.classificationExtra.classList.add("hidden");
    binding.classificationExtra.textContent = "";
  }

  const priorityScoreText = (task.priorityScoreTenths / 10).toFixed(3);
  if (binding.priorityScore.data !== priorityScoreText) binding.priorityScore.data = priorityScoreText;

  if (binding.currentStatus !== task.status) {
    binding.currentStatus = task.status;
    binding.statusBadge.className = `axtask-cell-status inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses(task.status)}`;
    binding.statusBadge.textContent = formatStatusLabel(task.status);
    el.dataset.status = task.status;
  }
}

export class PretextImperativeList {
  private readonly tbody: HTMLElement;
  private readonly doc: Document;
  private readonly template: HTMLTemplateElement;
  private readonly rows = new Map<string, RowBinding>();
  private readonly ledger: PerfLedger;
  private readonly surface: string;
  private readonly onRowEvent: (ev: RowEvent) => void;
  private dragMode: boolean;
  private listenerAbort: AbortController | null = null;
  private destroyed = false;

  constructor(tbody: HTMLElement, opts: PretextImperativeListOptions) {
    this.tbody = tbody;
    this.doc = tbody.ownerDocument ?? document;
    this.template = ensureTemplate(this.doc);
    this.ledger = opts.ledger ?? perfLedger();
    this.surface = opts.surface ?? "task-list";
    this.onRowEvent = opts.onRowEvent;
    this.dragMode = opts.dragMode ?? false;

    if (opts.tagSurface !== false) {
      tbody.dataset.axtaskSurface = this.surface;
    }

    this.installListeners();
  }

  setTasks(tasks: ImperativeRowTask[]): void {
    if (this.destroyed) return;
    const t0 = nowMs();

    const seen = new Set<string>();
    let prevEl: HTMLElement | null = null;
    for (const task of tasks) {
      seen.add(task.id);
      let binding = this.rows.get(task.id);
      if (!binding) {
        const frag = this.template.content.firstElementChild!.cloneNode(true) as HTMLTableRowElement;
        binding = bindRow(frag);
        this.rows.set(task.id, binding);
        this.tbody.appendChild(binding.el);
      }
      applyRow(binding, task);
      this.applyDragVisibility(binding);

      if (prevEl && binding.el.previousElementSibling !== prevEl) {
        this.tbody.insertBefore(binding.el, prevEl.nextSibling);
      } else if (!prevEl && this.tbody.firstElementChild !== binding.el) {
        this.tbody.insertBefore(binding.el, this.tbody.firstElementChild);
      }
      prevEl = binding.el;
    }

    for (const [id, binding] of this.rows) {
      if (!seen.has(id)) {
        binding.el.remove();
        this.rows.delete(id);
      }
    }

    const elapsed = nowMs() - t0;
    this.ledger.mark(this.surface, "update", elapsed, tasks.length);
  }

  setDragMode(enabled: boolean): void {
    if (this.dragMode === enabled) return;
    this.dragMode = enabled;
    for (const binding of this.rows.values()) this.applyDragVisibility(binding);
  }

  /** For tests + animation-budget integration. */
  getRowCount(): number {
    return this.rows.size;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.listenerAbort) this.listenerAbort.abort();
    this.listenerAbort = null;
    for (const binding of this.rows.values()) binding.el.remove();
    this.rows.clear();
  }

  private applyDragVisibility(binding: RowBinding): void {
    const cell = binding.el.querySelector<HTMLElement>(".axtask-drag-cell");
    if (!cell) return;
    if (this.dragMode) {
      cell.classList.remove("hidden");
    } else if (!cell.classList.contains("hidden")) {
      cell.classList.add("hidden");
    }
  }

  private installListeners(): void {
    const ctrl = new AbortController();
    this.listenerAbort = ctrl;

    const handler = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const actionEl = target.closest<HTMLElement>("[data-action]");
      if (!actionEl || !this.tbody.contains(actionEl)) return;
      const rowEl = actionEl.closest<HTMLTableRowElement>("tr[data-task-id]");
      const taskId = rowEl?.dataset.taskId;
      if (!taskId) return;
      const action = actionEl.dataset.action as RowAction | undefined;
      if (!action) return;
      if (action !== "open") ev.stopPropagation();
      this.onRowEvent({ taskId, action, target: actionEl, original: ev });
    };

    this.tbody.addEventListener("click", handler, { signal: ctrl.signal });
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
