import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./auth-context";
import { PersistedQueryLayer } from "./app-query-provider";

describe("PersistedQueryLayer", () => {
  it("renders children inside PersistQueryClientProvider after auth resolves", async () => {
    render(
      createElement(
        AuthProvider,
        null,
        createElement(
          PersistedQueryLayer,
          null,
          createElement("span", { "data-testid": "child" }, "mounted"),
        ),
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId("child")).toHaveTextContent("mounted");
    });
  });
});
