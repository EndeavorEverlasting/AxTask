import { TaskList } from "@/components/task-list";
import { ShoppingCart } from "lucide-react";

export default function ShoppingPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <ShoppingCart className="h-7 w-7 text-emerald-600 shrink-0" aria-hidden />
          Shopping list
        </h2>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          Check items off as you buy them. Voice can add line items as tasks; marking an item purchased completes that
          task.
        </p>
      </div>
      <TaskList variant="shopping" />
    </div>
  );
}
