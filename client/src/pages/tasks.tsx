import { TaskList } from "@/components/task-list";

export default function Tasks() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">All Tasks</h2>
        <p className="text-gray-600 dark:text-gray-400">View and manage all your tasks</p>
      </div>

      <TaskList />
    </div>
  );
}
