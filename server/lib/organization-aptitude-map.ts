type FilterSignalSource =
  | "header_sort_date"
  | "header_sort_updated"
  | "header_sort_created"
  | "header_sort_priority"
  | "header_sort_activity"
  | "header_sort_classification"
  | "header_sort_priority_score"
  | "header_sort_status"
  | "header_priority"
  | "header_status"
  | "header_classification"
  | "top_priority"
  | "top_status"
  | "route_chip"
  | "search";

export function sourceToAptitudeArchetype(source: FilterSignalSource): string {
  switch (source) {
    case "header_sort_date":
    case "header_sort_updated":
    case "header_sort_created":
    case "route_chip":
      return "strategy";
    case "header_sort_priority":
    case "header_sort_status":
    case "top_priority":
    case "top_status":
      return "productivity";
    case "header_sort_activity":
      return "social";
    case "header_sort_classification":
    case "header_sort_priority_score":
    case "header_classification":
    case "search":
      return "archetype";
    case "header_priority":
    case "header_status":
      return "mood";
    default:
      return "archetype";
  }
}
