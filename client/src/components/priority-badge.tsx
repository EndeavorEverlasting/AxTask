import { Badge } from "@/components/ui/badge";

interface PriorityBadgeProps {
  priority: string;
  score?: number;
}

export function PriorityBadge({ priority, score }: PriorityBadgeProps) {
  const getColorClasses = (priority: string) => {
    switch (priority) {
      case "Highest":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "High":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "Medium-High":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Medium":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "Low":
        return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
    }
  };

  const formatScore = (s: number) => {
    if (Number.isInteger(s)) return s.toString();
    return s.toFixed(3);
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getColorClasses(priority)}`}>
      {priority}
      {score !== undefined && score !== null && (
        <span className="ml-1 text-xs opacity-75">({formatScore(score)})</span>
      )}
    </span>
  );
}
