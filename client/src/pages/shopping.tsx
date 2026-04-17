import { TaskList } from "@/components/task-list";
import { GlassPanel } from "@/components/ui/glass-panel";
import { ShoppingCart } from "lucide-react";

export default function ShoppingPage() {
  return (
    <div className="p-4 md:p-6 space-y-6 md:space-y-8">
      <GlassPanel elevated className="p-4 md:p-5 space-y-2">
        <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <ShoppingCart className="h-7 w-7 text-primary shrink-0" aria-hidden />
          Shopping list
        </h2>
        <p className="text-sm md:text-base text-muted-foreground max-w-3xl leading-relaxed">
          Check items off as you buy them. Voice can add line items as tasks; marking an item purchased completes that
          task.
        </p>
      </GlassPanel>
      <TaskList variant="shopping" />
    </div>
  );
}
