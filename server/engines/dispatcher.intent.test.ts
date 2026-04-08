// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyIntent } from "./dispatcher";

describe("classifyIntent – task_review vs planner_query", () => {
  it("classifies first-person completion as task_review", () => {
    expect(classifyIntent("I finished the report")).toBe("task_review");
    expect(classifyIntent("I completed the deployment")).toBe("task_review");
    expect(classifyIntent("I already done with the meeting notes")).toBe("task_review");
    expect(classifyIntent("I've finished the tests")).toBe("task_review");
    expect(classifyIntent("I took care of the bug")).toBe("task_review");
  });

  it("classifies 'mark X as done' as task_review", () => {
    expect(classifyIntent("mark deployment as done")).toBe("task_review");
    expect(classifyIntent("mark task XYZ as completed")).toBe("task_review");
  });

  it("classifies bare status queries as planner_query, not task_review", () => {
    expect(classifyIntent("show me completed tasks")).toBe("planner_query");
    expect(classifyIntent("what tasks are done")).toBe("planner_query");
    expect(classifyIntent("finished tasks this week")).toBe("planner_query");
    expect(classifyIntent("completed")).toBe("planner_query");
  });

  it("classifies bulk review keywords as task_review", () => {
    expect(classifyIntent("bulk complete these tasks")).toBe("task_review");
    expect(classifyIntent("bulk review updates")).toBe("task_review");
  });
});
