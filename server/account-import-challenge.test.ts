import { describe, expect, it } from "vitest";
import {
  buildImportOwnershipChallenge,
  computeTasksFingerprint,
  gradeOwnershipQuiz,
  questionCountForImportTaskRows,
} from "./account-import-challenge";

describe("questionCountForImportTaskRows", () => {
  it("uses 1:1 for 1–3 tasks and stays flat at 3 for four or more", () => {
    expect(questionCountForImportTaskRows(0)).toBe(0);
    expect(questionCountForImportTaskRows(1)).toBe(1);
    expect(questionCountForImportTaskRows(2)).toBe(2);
    expect(questionCountForImportTaskRows(3)).toBe(3);
    expect(questionCountForImportTaskRows(4)).toBe(3);
    expect(questionCountForImportTaskRows(5)).toBe(3);
    expect(questionCountForImportTaskRows(999)).toBe(3);
  });
});

describe("computeTasksFingerprint", () => {
  it("is stable when row key order differs", () => {
    const a = [
      { id: "b", activity: "x", date: "2024-01-01" },
      { id: "a", activity: "y", date: "2024-01-02" },
    ];
    const b = [
      { date: "2024-01-02", activity: "y", id: "a" },
      { activity: "x", id: "b", date: "2024-01-01" },
    ];
    expect(computeTasksFingerprint(a)).toBe(computeTasksFingerprint(b));
  });
});

describe("gradeOwnershipQuiz", () => {
  it("fails when fewer than 80% correct (integer threshold)", () => {
    const expected = [
      { id: "q1", correctIndex: 0, choiceCount: 4 },
      { id: "q2", correctIndex: 0, choiceCount: 4 },
      { id: "q3", correctIndex: 0, choiceCount: 4 },
    ];
    const twoOfThree = [
      { questionId: "q1", selectedIndex: 0 },
      { questionId: "q2", selectedIndex: 0 },
      { questionId: "q3", selectedIndex: 3 },
    ];
    expect(gradeOwnershipQuiz(expected, twoOfThree)).toBe(false);
    const allRight = [
      { questionId: "q1", selectedIndex: 0 },
      { questionId: "q2", selectedIndex: 0 },
      { questionId: "q3", selectedIndex: 0 },
    ];
    expect(gradeOwnershipQuiz(expected, allRight)).toBe(true);
  });

  it("allows exactly 80% on five questions", () => {
    const expected = Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`,
      correctIndex: 0,
      choiceCount: 4,
    }));
    const answers = expected.map((q, i) => ({
      questionId: q.id,
      selectedIndex: i === 4 ? 3 : 0,
    }));
    expect(gradeOwnershipQuiz(expected, answers)).toBe(true);
  });

  it("returns true when there are zero expected questions", () => {
    expect(gradeOwnershipQuiz([], [])).toBe(true);
  });

  it("rejects wrong array length or missing ids", () => {
    const expected = [{ id: "q1", correctIndex: 0, choiceCount: 4 }];
    expect(gradeOwnershipQuiz(expected, [])).toBe(false);
    expect(gradeOwnershipQuiz(expected, [{ questionId: "q2", selectedIndex: 0 }])).toBe(false);
  });
});

describe("buildImportOwnershipChallenge", () => {
  it("returns no questions for empty tasks", () => {
    const r = buildImportOwnershipChallenge([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questions.length).toBe(0);
  });

  it("returns three questions when many tasks exist", () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`,
      date: "2024-01-01",
      time: `${String(i % 24).padStart(2, "0")}:00`,
      activity: `Unique activity number ${i}`,
      notes: `Longer notes line ${i} for distractors`,
      classification: i % 3 === 0 ? "alpha" : i % 3 === 1 ? "beta" : "gamma",
      priority: "high",
      status: "pending",
    }));
    const r = buildImportOwnershipChallenge(tasks);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questions.length).toBe(3);
    for (const q of r.questions) {
      expect(q.choices.length).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(4);
    }
  });
});
