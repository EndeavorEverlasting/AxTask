import type { Task, InsertTask } from "@shared/schema";

export function exportTasksToCSV(tasks: Task[]): string {
  const headers = [
    "Date", "Priority", "Activity", "Notes", "Urgency", "Impact", "Effort", 
    "Prerequisites", "Classification", "Score", "Status", "Created At"
  ];

  const csvRows = [
    headers.join(","),
    ...tasks.map(task => [
      task.date,
      task.priority,
      `"${task.activity.replace(/"/g, '""')}"`,
      `"${(task.notes || "").replace(/"/g, '""')}"`,
      task.urgency || "",
      task.impact || "",
      task.effort || "",
      `"${(task.prerequisites || "").replace(/"/g, '""')}"`,
      task.classification,
      task.priorityScore / 10,
      task.status,
      task.createdAt?.toISOString() || ""
    ].join(","))
  ];

  return csvRows.join("\n");
}

export function parseCSVToTasks(csvContent: string): InsertTask[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have header and at least one data row");

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const tasks: InsertTask[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    const task: Partial<InsertTask> = {};

    headers.forEach((header, index) => {
      const value = values[index]?.trim() || "";
      
      switch (header) {
        case "date":
          task.date = value;
          break;
        case "activity":
          task.activity = value;
          break;
        case "notes":
          task.notes = value;
          break;
        case "urgency":
          task.urgency = value ? parseInt(value) : undefined;
          break;
        case "impact":
          task.impact = value ? parseInt(value) : undefined;
          break;
        case "effort":
          task.effort = value ? parseInt(value) : undefined;
          break;
        case "prerequisites":
          task.prerequisites = value;
          break;
        case "status":
          if (["pending", "in-progress", "completed"].includes(value)) {
            task.status = value as "pending" | "in-progress" | "completed";
          }
          break;
      }
    });

    if (task.date && task.activity) {
      tasks.push(task as InsertTask);
    }
  }

  return tasks;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
