import { apiRequest } from "@/lib/queryClient";

export type StudyDeck = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  sourceType: "manual" | "tasks" | "planner";
  sourceRef: string | null;
  cardLimitPerSession: number;
  sessionDurationMinutes: number;
};

export type StudyCard = {
  id: string;
  deckId: string;
  userId: string;
  prompt: string;
  answer: string;
  topic: string | null;
  tagsJson: string | null;
  sourceTaskId: string | null;
};

export type StudySession = {
  id: string;
  deckId: string;
  userId: string;
  gameType: "flashcard_sprint";
  status: "active" | "completed" | "abandoned";
  totalCards: number;
  answeredCards: number;
  correctCards: number;
  scorePercent: number;
  avgResponseMs: number | null;
  weakTopicsJson: string | null;
  rewardCoins: number;
};

export async function fetchStudyDecks(): Promise<StudyDeck[]> {
  const res = await apiRequest("GET", "/api/study/decks");
  return res.json();
}

export async function createStudyDeck(input: {
  title: string;
  description?: string;
  sourceType?: "manual" | "tasks" | "planner";
  sourceRef?: string;
  cardLimitPerSession?: number;
  sessionDurationMinutes?: number;
}): Promise<StudyDeck> {
  const res = await apiRequest("POST", "/api/study/decks", input);
  return res.json();
}

export async function fetchDeckCards(deckId: string): Promise<StudyCard[]> {
  const res = await apiRequest("GET", `/api/study/decks/${deckId}/cards`);
  return res.json();
}

export async function createDeckCard(deckId: string, input: {
  prompt: string;
  answer: string;
  topic?: string;
  tagsJson?: string;
  sourceTaskId?: string;
}): Promise<StudyCard> {
  const res = await apiRequest("POST", `/api/study/decks/${deckId}/cards`, input);
  return res.json();
}

export async function startFlashcardSprint(deckId: string): Promise<StudySession> {
  const res = await apiRequest("POST", "/api/study/sessions/start", {
    deckId,
    gameType: "flashcard_sprint",
  });
  return res.json();
}

export async function submitFlashcardAnswer(
  sessionId: string,
  input: { cardId: string; grade: "again" | "hard" | "good" | "easy"; responseMs: number },
): Promise<{ session: StudySession; awardedCoins: number }> {
  const res = await apiRequest("POST", `/api/study/sessions/${sessionId}/answer`, input);
  return res.json();
}

export async function fetchSessionSummary(sessionId: string): Promise<StudySession> {
  const res = await apiRequest("GET", `/api/study/sessions/${sessionId}/summary`);
  return res.json();
}
