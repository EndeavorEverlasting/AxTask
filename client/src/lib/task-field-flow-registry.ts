export interface TaskFieldDescriptor {
  id: string;
  order: number;
  resizable: boolean;
}

export const TASK_FIELD_FLOW: TaskFieldDescriptor[] = [
  { id: "activity", order: 1, resizable: false },
  { id: "notes", order: 2, resizable: true },
  { id: "prerequisites", order: 3, resizable: true },
];

export function getFirstFieldId(): string {
  return TASK_FIELD_FLOW[0].id;
}

export function getNextFieldId(currentId: string): string | null {
  const currentIndex = TASK_FIELD_FLOW.findIndex(f => f.id === currentId);
  if (currentIndex === -1 || currentIndex === TASK_FIELD_FLOW.length - 1) return null;
  return TASK_FIELD_FLOW[currentIndex + 1].id;
}

export function isResizableField(id: string): boolean {
  const field = TASK_FIELD_FLOW.find(f => f.id === id);
  return field ? field.resizable : false;
}
