import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { TaskGanttFlow } from "./task-gantt-flow";

describe("TaskGanttFlow", () => {
  it("mounts React Flow with HUD and legend slots", () => {
    render(
      <ReactFlowProvider>
        <div className="h-[420px] w-[800px]">
          <TaskGanttFlow
            nodes={[]}
            edges={[]}
            layoutKey="empty"
            worldHeight={400}
            todayX={null}
            hudProps={{
              mode: "readable",
              onModeChange: () => {},
              scope: "next-21-days",
              onScopeChange: () => {},
              unlocked: true,
              showCriticalPath: false,
              onToggleCriticalPath: () => {},
              blockedOnly: false,
              onToggleBlockedOnly: () => {},
              legendOpen: true,
              onToggleLegend: () => {},
            }}
            legendSlot={<span data-testid="legend-slot">Legend here</span>}
          />
        </div>
      </ReactFlowProvider>,
    );
    expect(screen.getByTestId("legend-slot")).toBeInTheDocument();
    expect(screen.getByText("Fit")).toBeInTheDocument();
  });
});
