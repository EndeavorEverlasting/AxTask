// Compatibility shim only.
//
// The active task list implementation lives in `task-list-host.tsx` and is
// what `/tasks` and `/shopping` import. This file is kept as a thin re-export
// so stale imports do not pull the retired legacy implementation into
// Typecheck.

export {
  TaskListHost as TaskList,
  TaskListHost as default,
} from "@/components/task-list-host";

export type {
  TaskListHostProps as TaskListProps,
} from "@/components/task-list-host";
