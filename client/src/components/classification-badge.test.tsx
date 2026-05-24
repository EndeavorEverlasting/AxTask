import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockCategories = {
  builtIn: [
    { label: "Crisis", coins: 5 },
    { label: "Development", coins: 3 },
    { label: "Meeting", coins: 2 },
    { label: "Administrative", coins: 2 },
    { label: "Research", coins: 3 },
    { label: "Maintenance", coins: 2 },
  ],
  custom: [],
};

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn((_method: string, path: string) =>
    Promise.resolve({
      json: () =>
        Promise.resolve(
          path === "/api/classification/categories"
            ? mockCategories
            : path === "/api/classification/suggestions"
              ? { suggestions: [] }
              : {},
        ),
    }),
  ),
  getCsrfToken: vi.fn(() => "test-token"),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/use-immersive-sounds", () => {
  const noop = vi.fn();
  const sounds = new Proxy(
    {},
    {
      get: (_target, prop) => (prop === "enabled" ? false : noop),
    },
  );
  return { useImmersiveSounds: () => sounds };
});

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

  it("does not render the retired onboarding hint and opens the current category picker", async () => {
    vi.resetModules();
    const { ClassificationBadge } = await import("./classification-badge");
    localStorage.removeItem(CLASSIFY_HINT_KEY);

    render(
      <ClassificationBadge classification="General" taskId="hint-task-fresh" editable />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText("Tap to classify & earn coins!")).toBeNull();

    const button = screen.getByRole("button", { name: /general/i });
    fireEvent.click(button);

    expect(await screen.findByText("Your categories (multi-select)")).toBeTruthy();
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

  it("renders the current editable button without the retired title attribute", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    render(
      <ClassificationBadge classification="General" taskId="task-2" editable />,
      { wrapper: createWrapper() }
    );
    const btn = screen.getByRole("button", { name: /general/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("title")).toBeNull();
  });

  it("shows the chevron affordance in editable mode", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    const { container } = render(
      <ClassificationBadge classification="Crisis" taskId="task-3" editable />,
      { wrapper: createWrapper() }
    );
    const svg = container.querySelectorAll("svg");
    expect(svg.length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector(".lucide-chevron-down")).toBeTruthy();
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

    const button = screen.getByRole("button", { name: /general/i });
    fireEvent.click(button);

    expect(await screen.findByText("Your categories (multi-select)")).toBeTruthy();
    expect(screen.queryByText("Crisis")).toBeTruthy();
    expect(screen.queryByText("Research")).toBeTruthy();
    expect(screen.queryByText("Development")).toBeTruthy();

    expect(screen.queryByText("+5")).toBeTruthy();
    expect(screen.queryAllByText("+3").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText("+2").length).toBeGreaterThanOrEqual(1);
  });

  it("preselects the current classification in the multi-select popover", async () => {
    const { ClassificationBadge } = await import("./classification-badge");
    render(
      <ClassificationBadge classification="Crisis" taskId="disable-task" editable />,
      { wrapper: createWrapper() }
    );

    const button = screen.getByRole("button", { name: /crisis/i });
    fireEvent.click(button);
    expect(await screen.findByText("Your categories (multi-select)")).toBeTruthy();

    const crisisLabel = screen
      .getAllByText("Crisis")
      .map((el) => el.closest("label"))
      .find(Boolean);
    const input = crisisLabel?.querySelector("input") as HTMLInputElement | null;
    expect(input?.checked).toBe(true);
  });
});
