import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDeckCard,
  createStudyDeck,
  fetchDeckCards,
  fetchSessionSummary,
  fetchStudyDecks,
  startFlashcardSprint,
  submitFlashcardAnswer,
} from "./study-api";

const apiRequestMock = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

describe("study-api", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("fetchStudyDecks hits expected endpoint", async () => {
    apiRequestMock.mockResolvedValue({ json: async () => [{ id: "d1" }] });
    const decks = await fetchStudyDecks();
    expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/study/decks");
    expect(decks).toEqual([{ id: "d1" }]);
  });

  it("createStudyDeck posts payload", async () => {
    apiRequestMock.mockResolvedValue({ json: async () => ({ id: "d1", title: "Exam" }) });
    const deck = await createStudyDeck({ title: "Exam" });
    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/study/decks", { title: "Exam" });
    expect(deck.title).toBe("Exam");
  });

  it("session flow calls correct routes", async () => {
    apiRequestMock
      .mockResolvedValueOnce({ json: async () => [{ id: "c1" }] })
      .mockResolvedValueOnce({ json: async () => ({ id: "s1", status: "active" }) })
      .mockResolvedValueOnce({ json: async () => ({ session: { id: "s1", status: "completed" }, awardedCoins: 10 }) })
      .mockResolvedValueOnce({ json: async () => ({ id: "s1", scorePercent: 90 }) });

    await fetchDeckCards("deckA");
    await startFlashcardSprint("deckA");
    await submitFlashcardAnswer("s1", { cardId: "c1", grade: "good", responseMs: 500 });
    await fetchSessionSummary("s1");

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "GET", "/api/study/decks/deckA/cards");
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "POST", "/api/study/sessions/start", {
      deckId: "deckA",
      gameType: "flashcard_sprint",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "POST", "/api/study/sessions/s1/answer", {
      cardId: "c1",
      grade: "good",
      responseMs: 500,
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(4, "GET", "/api/study/sessions/s1/summary");
  });

  it("createDeckCard posts to deck card endpoint", async () => {
    apiRequestMock.mockResolvedValue({ json: async () => ({ id: "c1" }) });
    await createDeckCard("deckA", { prompt: "Q", answer: "A" });
    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/study/decks/deckA/cards", {
      prompt: "Q",
      answer: "A",
    });
  });
});
