import { TaskList } from "@/components/task-list";
import { ShoppingCart } from "lucide-react";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";

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
      <TaskList variant="shopping" />
    </div>
  );
}
