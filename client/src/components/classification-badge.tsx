interface ClassificationBadgeProps {
  classification: string;
}

export function ClassificationBadge({ classification }: ClassificationBadgeProps) {
  const getColorClasses = (classification: string) => {
    switch (classification) {
      case "Development":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "Meeting":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "Administrative":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "Research":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
      case "Maintenance":
        return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getColorClasses(classification)}`}>
      {classification}
    </span>
  );
}
