import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-gantt-pack-unlocked", () => ({
  useGanttPackUnlocked: () => ({ unlocked: true, reason: "redeemed" as const, avatarLevel: 5 }),
}));

vi.mock("@/components/gantt/task-gantt-workspace", () => ({
  TaskGanttWorkspace: () => <div data-testid="gantt-workspace-mock" />,
}));

import PlannerTimelinePage from "./planner-timeline";

describe("PlannerTimelinePage", () => {
  it("renders workspace shell", () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    qc.setQueryData(["/api/tasks"], []);
    render(
      <QueryClientProvider client={qc}>
        <PlannerTimelinePage />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("gantt-workspace-mock")).toBeInTheDocument();
    expect(screen.getByText(/Timeline workspace/i)).toBeInTheDocument();
  });
});
