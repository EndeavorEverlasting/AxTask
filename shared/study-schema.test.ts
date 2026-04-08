import { describe, expect, it } from "vitest";
import {
  createStudyDeckSchema,
  createStudyCardSchema,
  startStudySessionSchema,
  submitStudyAnswerSchema,
} from "./schema";

describe("study mini-game schemas", () => {
  it("accepts valid flashcard sprint setup payloads", () => {
    const deck = createStudyDeckSchema.parse({
      title: "Exam Review",
      sourceType: "manual",
      cardLimitPerSession: 10,
      sessionDurationMinutes: 5,
    });
    const card = createStudyCardSchema.parse({
      deckId: "deck_1",
      prompt: "Define veracity",
      answer: "Conformity to facts",
      topic: "vocabulary",
    });
    const start = startStudySessionSchema.parse({ deckId: "deck_1", gameType: "flashcard_sprint" });
    const answer = submitStudyAnswerSchema.parse({ cardId: "card_1", grade: "good", responseMs: 1200 });

    expect(deck.title).toBe("Exam Review");
    expect(card.topic).toBe("vocabulary");
    expect(start.gameType).toBe("flashcard_sprint");
    expect(answer.grade).toBe("good");
  });

  it("rejects invalid grading values", () => {
    const result = submitStudyAnswerSchema.safeParse({ cardId: "card_1", grade: "perfect" });
    expect(result.success).toBe(false);
  });
});
