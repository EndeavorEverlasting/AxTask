import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppQueryProvider } from "./app-query-provider";

describe("AppQueryProvider", () => {
  it("renders children inside PersistQueryClientProvider", () => {
    render(
      createElement(
        AppQueryProvider,
        null,
        createElement("span", { "data-testid": "child" }, "mounted"),
      ),
    );
    expect(screen.getByTestId("child")).toHaveTextContent("mounted");
  });
});
