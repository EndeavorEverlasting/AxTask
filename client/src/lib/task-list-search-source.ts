import type { Task } from "@shared/schema";

/** Chooses full list vs server search results for the Tasks table pipeline. */
export function resolveTaskListSearchSource(input: {
  browserOnline: boolean;
  debouncedQuery: string;
  allTasks: Task[];
  /** Pass `undefined` while the search request is in flight or when server search is disabled. */
  searchResults: Task[] | undefined;
}): { baseTasks: Task[]; applyLocalSearch: boolean; serverSearchActive: boolean } {
  const q = input.debouncedQuery.trim();
  const wantsServer = input.browserOnline && q.length >= 2;
  if (!wantsServer) {
    return { baseTasks: input.allTasks, applyLocalSearch: true, serverSearchActive: false };
  }
  if (input.searchResults !== undefined) {
    return {
      baseTasks: input.searchResults,
      applyLocalSearch: false,
      serverSearchActive: true,
    };
  }
  return { baseTasks: input.allTasks, applyLocalSearch: true, serverSearchActive: false };
}
