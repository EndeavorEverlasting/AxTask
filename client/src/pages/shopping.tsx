import { TaskListHost } from "@/components/task-list-host";
import { ShoppingCart } from "lucide-react";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";

/**
 * Shopping list surface — now powered by the pretext-centric
 * `TaskListHost` via its `variant="shopping"` switch. That drops the
 * ~1,700-line legacy framer-motion + dnd-kit `<TaskList />` from the
 * initial bundle for every user who never visits /shopping, and ties
 * the view to the same imperative row controller used by /tasks.
 *
 * Voice add / bulk import for shopping items still flows through the
 * standard POST /api/tasks path (invoked from the top-nav voice bar);
 * this page is read-focused.
 */
export default function ShoppingPage() {
  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      <PretextPageHeader
        eyebrow="Errands"
        title={
          <span className="inline-flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary shrink-0" aria-hidden />
            Shopping list
          </span>
        }
        subtitle="Check items off as you buy them. Voice can add line items as tasks; marking an item purchased completes that task."
      />
      <TaskListHost variant="shopping" />
    </div>
  );
}
