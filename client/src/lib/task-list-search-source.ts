import type { Task } from "@shared/schema";

export function resolveTaskListSearchSource(input: {
  browserOnline: boolean;
  debouncedQuery: string;
  allTasks: Task[];
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

