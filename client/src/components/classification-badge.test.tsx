import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(() => Promise.resolve({ json: () => Promise.resolve({}) })),
  getCsrfToken: vi.fn(() => "test-token"),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const CLASSIFY_HINT_KEY = "axtask_classify_hint_seen";

describe("getClassificationColor", () => {
  it("returns correct color for each classification", async () => {
    const { getClassificationColor } = await import("./classification-badge");
    expect(getClassificationColor("Crisis")).toContain("red");
    expect(getClassificationColor("Development")).toContain("blue");
    expect(getClassificationColor("Meeting")).toContain("green");
    expect(getClassificationColor("Administrative")).toContain("purple");
    expect(getClassificationColor("Research")).toContain("indigo");
    expect(getClassificationColor("Maintenance")).toContain("teal");
    expect(getClassificationColor("Unknown")).toContain("gray");
  });
});

describe("ClassificationBadge - hint system (must run first due to module state)", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows onboarding hint for first-time editable badge and dismisses on click", async () => {
    vi.resetModules();
    const { ClassificationBadge } = await import("./classification-badge");
    localStorage.removeItem(CLASSIFY_HINT_KEY);

    render(
      <ClassificationBadge classification="General" taskId="hint-task-fresh" editable />,
      { wrapper: createWrapper() }
    );

    const hintText = screen.queryByText("Tap to classify & earn coins!");
    expect(hintText).toBeTruthy();

    const button = screen.getByTitle("Classify to earn coins");
    fireEvent.click(button);

    expect(localStorage.getItem(CLASSIFY_HINT_KEY)).toBe("true");
  });

  it("hides hint when localStorage already set", async () => {
    vi.resetModules();
    const { ClassificationBadge } = await import("./classification-badge");
    localStorage.setItem(CLASSIFY_HINT_KEY, "true");

    render(
      <ClassificationBadge classification="General" taskId="hint-task-seen" editable />,
      { wrapper: createWrapper() }
    );

    const hintText = screen.queryByText("Tap to classify & earn coins!");
    expect(hintText).toBeNull();
  });
});

describe("ClassificationBadge - rendering", () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem(CLASSIFY_HINT_KEY, "true");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders classification text in non-editable mode", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    render(<ClassificationBadge classification="Crisis" />, { wrapper: createWrapper() });
    expect(screen.getByText("Crisis")).toBeTruthy();
  });

  it("renders as a plain span when not editable", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    const { container } = render(<ClassificationBadge classification="Meeting" />, { wrapper: createWrapper() });
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe("Meeting");
    const button = container.querySelector("button");
    expect(button).toBeNull();
  });

  it("renders a clickable button when editable with taskId", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    const { container } = render(
      <ClassificationBadge classification="Development" taskId="task-1" editable />,
      { wrapper: createWrapper() }
    );
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain("Development");
  });

  it("shows title 'Classify to earn coins' on editable button", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    render(
      <ClassificationBadge classification="General" taskId="task-2" editable />,
      { wrapper: createWrapper() }
    );
    const btn = screen.getByTitle("Classify to earn coins");
    expect(btn).toBeTruthy();
  });

  it("shows pencil and chevron icons in editable mode", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    const { container } = render(
      <ClassificationBadge classification="Crisis" taskId="task-3" editable />,
      { wrapper: createWrapper() }
    );
    const svg = container.querySelectorAll("svg");
    expect(svg.length).toBeGreaterThanOrEqual(2);
  });

  it("renders as non-editable span when editable=true but no taskId", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    const { container } = render(
      <ClassificationBadge classification="Crisis" editable />,
      { wrapper: createWrapper() }
    );
    const button = container.querySelector("button");
    expect(button).toBeNull();
    expect(screen.getByText("Crisis")).toBeTruthy();
  });

  it("opens popover on click showing category options with coin amounts", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    render(
      <ClassificationBadge classification="General" taskId="popover-task" editable />,
      { wrapper: createWrapper() }
    );

    const button = screen.getByTitle("Classify to earn coins");
    fireEvent.click(button);

    expect(screen.queryByText("Classify to earn coins")).toBeTruthy();
    expect(screen.queryByText("Crisis")).toBeTruthy();
    expect(screen.queryByText("Research")).toBeTruthy();
    expect(screen.queryByText("Development")).toBeTruthy();

    expect(screen.queryByText("+15")).toBeTruthy();
    expect(screen.queryByText("+12")).toBeTruthy();
    expect(screen.queryByText("+10")).toBeTruthy();
  });

  it("disables the current classification in the popover", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    render(
      <ClassificationBadge classification="Crisis" taskId="disable-task" editable />,
      { wrapper: createWrapper() }
    );

    const button = screen.getByTitle("Classify to earn coins");
    fireEvent.click(button);

    const crisisButtons = screen.getAllByText("Crisis");
    const popoverCrisisBtn = crisisButtons.find(
      el => el.closest("button")?.getAttribute("disabled") !== null
    );
    expect(popoverCrisisBtn).toBeTruthy();
  });
});
