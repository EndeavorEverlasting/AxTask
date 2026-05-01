/** In-memory dependency helpers for task picks and template materialization. */

export type DepGraph = Map<string, string[]>;

function reachableFrom(start: string, graph: DepGraph, target: string): boolean {
  const seen = new Set<string>();
  const stack = [...(graph.get(start) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === target) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    const next = graph.get(n);
    if (next) stack.push(...next);
  }
  return false;
}

/**
 * Returns true if adding edges `fromId -> each of candidates` would create a directed cycle.
 * `graph` maps node -> list of predecessor nodes (tasks that must finish before this one).
 */
export function wouldCreateCycle(graph: DepGraph, fromId: string, candidates: string[]): boolean {
  for (const c of candidates) {
    if (c === fromId) return true;
    // If `fromId` is reachable from `c` along existing deps, linking c -> fromId closes a loop.
    if (reachableFrom(c, graph, fromId)) return true;
  }
  return false;
}

export interface KeyedDepItem {
  key: string;
  dependsOnKeys?: string[] | null;
}

/**
 * Topological sort for template items keyed by `key` with `dependsOnKeys` predecessors.
 * Throws if a cycle exists or an unknown key is referenced.
 */
export function topoSortKeyedItems<T extends KeyedDepItem>(items: T[]): T[] {
  const byKey = new Map(items.map((it) => [it.key, it] as const));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const it of items) {
    incoming.set(it.key, 0);
    outgoing.set(it.key, []);
  }
  for (const it of items) {
    const deps = it.dependsOnKeys?.filter(Boolean) ?? [];
    for (const d of deps) {
      if (!byKey.has(d)) {
        throw new Error(`Unknown dependency key: ${d}`);
      }
      incoming.set(it.key, (incoming.get(it.key) ?? 0) + 1);
      const arr = outgoing.get(d) ?? [];
      arr.push(it.key);
      outgoing.set(d, arr);
    }
  }

  const queue: string[] = [];
  for (const [k, deg] of incoming) {
    if (deg === 0) queue.push(k);
  }
  queue.sort();
  const out: T[] = [];
  while (queue.length) {
    const k = queue.shift()!;
    const it = byKey.get(k);
    if (it) out.push(it);
    for (const nxt of outgoing.get(k) ?? []) {
      const nextDeg = (incoming.get(nxt) ?? 0) - 1;
      incoming.set(nxt, nextDeg);
      if (nextDeg === 0) queue.push(nxt);
    }
    queue.sort();
  }
  if (out.length !== items.length) {
    throw new Error("Dependency cycle in template items");
  }
  return out;
}

/**
 * Topological sort of task IDs using `dependsOn` as predecessor lists (task id -> ids it depends on).
 */
export function topoSortTasks<T extends { id: string; dependsOn?: string[] | null }>(tasks: T[]): T[] {
  const byId = new Map(tasks.map((t) => [t.id, t] as const));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const t of tasks) {
    incoming.set(t.id, 0);
    outgoing.set(t.id, []);
  }
  for (const t of tasks) {
    const deps = t.dependsOn?.filter(Boolean) ?? [];
    for (const d of deps) {
      if (!byId.has(d)) continue;
      incoming.set(t.id, (incoming.get(t.id) ?? 0) + 1);
      const arr = outgoing.get(d) ?? [];
      arr.push(t.id);
      outgoing.set(d, arr);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of incoming) {
    if (deg === 0) queue.push(id);
  }
  queue.sort();
  const out: T[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const row = byId.get(id);
    if (row) out.push(row);
    for (const nxt of outgoing.get(id) ?? []) {
      const nextDeg = (incoming.get(nxt) ?? 0) - 1;
      incoming.set(nxt, nextDeg);
      if (nextDeg === 0) queue.push(nxt);
    }
    queue.sort();
  }
  if (out.length !== tasks.length) {
    throw new Error("Dependency cycle in tasks");
  }
  return out;
}
