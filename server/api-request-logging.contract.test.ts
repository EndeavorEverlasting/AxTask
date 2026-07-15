// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Low-noise audit discipline regression guard.
 *
 * Storing one `api_request` security event per normal `/api/*` response is
 * unbounded low-value telemetry that pressured the database during the
 * Neon/Node memory incident. This contract ensures the per-request write
 * stays behind the explicit application-side opt-in while the meaningful
 * 5xx `api_error` audit and admin notification remain always-on.
 *
 * The assertions use the TypeScript AST instead of source-text ordering so a
 * future refactor cannot move either event across a guard boundary while the
 * test still passes.
 */
const routesSrc = fs.readFileSync(
  path.resolve(__dirname, "routes.ts"),
  "utf8",
);

const sourceFile = ts.createSourceFile(
  "routes.ts",
  routesSrc,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function collectNodes<T extends ts.Node>(
  predicate: (node: ts.Node) => node is T,
): T[] {
  const matches: T[] = [];

  const visit = (node: ts.Node): void => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return matches;
}

function findAncestor<T extends ts.Node>(
  node: ts.Node,
  predicate: (candidate: ts.Node) => candidate is T,
): T | undefined {
  let current = node.parent;
  while (current) {
    if (predicate(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function eventTypeAssignments(eventType: string): ts.PropertyAssignment[] {
  return collectNodes(
    (node): node is ts.PropertyAssignment =>
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === "eventType" &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === eventType,
  );
}

function callsNamed(name: string): ts.CallExpression[] {
  return collectNodes(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name,
  );
}

const isApiRequestFlagGuard = (
  node: ts.Node,
): node is ts.IfStatement =>
  ts.isIfStatement(node) &&
  node.expression.getText(sourceFile) === "SECURITY_API_REQUEST_LOGGING";

const isHttp5xxGuard = (node: ts.Node): node is ts.IfStatement =>
  ts.isIfStatement(node) &&
  node.expression.getText(sourceFile).includes("res.statusCode >= 500");

describe("api_request security-event telemetry gate", () => {
  it("defines the SECURITY_API_REQUEST_LOGGING application-side opt-in", () => {
    const declarations = collectNodes(
      (node): node is ts.VariableDeclaration =>
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) === "SECURITY_API_REQUEST_LOGGING",
    );

    expect(declarations).toHaveLength(1);
    expect(declarations[0]!.initializer?.getText(sourceFile)).toBe(
      'process.env.SECURITY_API_REQUEST_LOGGING === "true"',
    );
  });

  it("keeps the sole api_request append lexically inside the opt-in guard", () => {
    const assignments = eventTypeAssignments("api_request");
    expect(assignments).toHaveLength(1);

    const guard = findAncestor(assignments[0]!, isApiRequestFlagGuard);
    expect(guard, "api_request append escaped the opt-in guard").toBeDefined();
  });

  it("keeps the 5xx api_error append outside the api_request opt-in guard", () => {
    const assignments = eventTypeAssignments("api_error");
    expect(assignments.length).toBeGreaterThan(0);

    const fallback = assignments.find((assignment) =>
      Boolean(findAncestor(assignment, isHttp5xxGuard)),
    );
    expect(fallback, "5xx api_error fallback not found").toBeDefined();
    expect(
      findAncestor(fallback!, isApiRequestFlagGuard),
      "5xx api_error became dependent on SECURITY_API_REQUEST_LOGGING",
    ).toBeUndefined();
  });

  it("keeps notifyAdminsOfApiError inside the 5xx branch and outside the opt-in guard", () => {
    const notifications = callsNamed("notifyAdminsOfApiError");
    const fallbackNotification = notifications.find((call) =>
      Boolean(findAncestor(call, isHttp5xxGuard)),
    );

    expect(fallbackNotification, "5xx admin notification not found").toBeDefined();
    expect(
      findAncestor(fallbackNotification!, isApiRequestFlagGuard),
      "5xx admin notification became dependent on SECURITY_API_REQUEST_LOGGING",
    ).toBeUndefined();
  });
});
