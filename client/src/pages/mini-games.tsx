import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Gamepad2, Sparkles, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  createDeckCard,
  createStudyDeck,
  fetchDeckCards,
  fetchSessionSummary,
  fetchStudyDecks,
  startFlashcardSprint,
  submitFlashcardAnswer,
  type StudyCard,
  type StudyDeck,
  type StudySession,
} from "@/lib/study-api";

type FlashcardGrade = "again" | "hard" | "good" | "easy";

const GAMES_REGISTRY: Array<{
  id: string;
  title: string;
  status: "live" | "planned";
  cadence?: string;
  grades?: FlashcardGrade[];
}> = [
  {
    id: "flashcard_sprint",
    title: "Flashcard Sprint",
    status: "live",
    cadence: "10 cards or 5 minutes",
    grades: ["again", "hard", "good", "easy"] as FlashcardGrade[],
  },
  { id: "match_pairs", title: "Match Pairs", status: "planned" },
  { id: "timed_recall", title: "Timed Recall", status: "planned" },
];

export default function MiniGamesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [deckTitle, setDeckTitle] = useState("");
  const [cardPrompt, setCardPrompt] = useState("");
  const [cardAnswer, setCardAnswer] = useState("");
  const [cardTopic, setCardTopic] = useState("");
  const [session, setSession] = useState<StudySession | null>(null);
  const [summary, setSummary] = useState<StudySession | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);

  const { data: decks = [] } = useQuery<StudyDeck[]>({ queryKey: ["/api/study/decks"], queryFn: fetchStudyDecks });
  const { data: cards = [] } = useQuery<StudyCard[]>({
    queryKey: ["/api/study/decks", selectedDeckId, "cards"],
    queryFn: () => fetchDeckCards(selectedDeckId),
    enabled: Boolean(selectedDeckId),
  });

  const activeCard = cards[cardIndex] || null;
  const canGrade = Boolean(session && activeCard && revealed);
  const flashcardConfig = GAMES_REGISTRY[0] as {
    id: string;
    title: string;
    status: "live";
    cadence: string;
    grades: FlashcardGrade[];
  };

  const createDeckMutation = useMutation({
    mutationFn: () => createStudyDeck({ title: deckTitle, sourceType: "manual", cardLimitPerSession: 10, sessionDurationMinutes: 5 }),
    onSuccess: (deck) => {
      queryClient.invalidateQueries({ queryKey: ["/api/study/decks"] });
      setDeckTitle("");
      setSelectedDeckId(deck.id);
      toast({ title: "Deck created", description: "Your Flashcard Sprint deck is ready." });
    },
    onError: (error: Error) => toast({ title: "Could not create deck", description: error.message, variant: "destructive" }),
  });

  const createCardMutation = useMutation({
    mutationFn: () => createDeckCard(selectedDeckId, { prompt: cardPrompt, answer: cardAnswer, topic: cardTopic || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/study/decks", selectedDeckId, "cards"] });
      setCardPrompt("");
      setCardAnswer("");
      setCardTopic("");
    },
    onError: (error: Error) => toast({ title: "Could not add card", description: error.message, variant: "destructive" }),
  });

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const started = await startFlashcardSprint(selectedDeckId);
      return started;
    },
    onSuccess: (started) => {
      setSession(started);
      setSummary(null);
      setCardIndex(0);
      setRevealed(false);
      setQuestionStartedAt(Date.now());
      toast({ title: "Flashcard Sprint started", description: "Use Again/Hard/Good/Easy to grade each card." });
    },
    onError: (error: Error) => toast({ title: "Could not start session", description: error.message, variant: "destructive" }),
  });

  const submitGradeMutation = useMutation({
    mutationFn: async (grade: FlashcardGrade) => {
      if (!session || !activeCard || !questionStartedAt) throw new Error("No active card");
      const responseMs = Math.max(0, Date.now() - questionStartedAt);
      return submitFlashcardAnswer(session.id, { cardId: activeCard.id, grade, responseMs });
    },
    onSuccess: async (result) => {
      setSession(result.session);
      const nextIndex = cardIndex + 1;
      if (nextIndex >= cards.length || result.session.status === "completed") {
        const latest = await fetchSessionSummary(result.session.id);
        setSummary(latest);
        setSession(latest);
        setCardIndex(Math.max(0, cards.length - 1));
        setRevealed(true);
        if (result.awardedCoins > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/gamification/wallet"] });
          queryClient.invalidateQueries({ queryKey: ["/api/gamification/transactions"] });
          toast({ title: "Session complete", description: `You earned ${result.awardedCoins} AxCoins.` });
        }
        return;
      }
      setCardIndex(nextIndex);
      setRevealed(false);
      setQuestionStartedAt(Date.now());
    },
    onError: (error: Error) => toast({ title: "Could not submit grade", description: error.message, variant: "destructive" }),
  });

  const gameStatus = useMemo(() => {
    if (!session) return "ready";
    if (session.status === "completed") return "completed";
    return "in_progress";
  }, [session]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-indigo-500" />
            Mini-Games
          </h1>
          <p className="text-sm text-muted-foreground">Study sub-experiences for focused review rounds.</p>
        </div>
        <Badge variant="secondary" className="capitalize">{gameStatus.replace("_", " ")}</Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              {flashcardConfig.title}
            </CardTitle>
            <CardDescription>
              {flashcardConfig.cadence} - grade with {flashcardConfig.grades.join(", ")}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDeckId ? (
              <p className="text-sm text-muted-foreground">Create or choose a deck to start.</p>
            ) : cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add at least one card to launch your first sprint.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border p-4 min-h-[160px]">
                  <p className="text-xs text-muted-foreground mb-2">
                    Card {Math.min(cardIndex + 1, cards.length)} / {cards.length}
                  </p>
                  <p className="font-medium">{activeCard?.prompt}</p>
                  {revealed ? (
                    <div className="mt-4 border-t pt-3 text-sm">
                      <p className="font-semibold">Answer</p>
                      <p>{activeCard?.answer}</p>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRevealed((v) => !v);
                      if (!questionStartedAt) setQuestionStartedAt(Date.now());
                    }}
                    disabled={!session}
                  >
                    {revealed ? "Hide" : "Reveal"}
                  </Button>
                  {!session ? (
                    <Button onClick={() => startSessionMutation.mutate()} disabled={!selectedDeckId || cards.length === 0}>
                      <Timer className="h-4 w-4 mr-2" />
                      Start Sprint
                    </Button>
                  ) : null}
                  {["again", "hard", "good", "easy"].map((grade) => (
                    <Button
                      key={grade}
                      variant={grade === "good" || grade === "easy" ? "default" : "secondary"}
                      disabled={!canGrade || submitGradeMutation.isPending}
                      onClick={() => submitGradeMutation.mutate(grade as FlashcardGrade)}
                    >
                      {grade}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {summary ? (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                <p className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Session Summary</p>
                <p>Score: {summary.scorePercent}% ({summary.correctCards}/{summary.answeredCards})</p>
                <p>Coins earned: {summary.rewardCoins}</p>
                <p>Weak topics: {summary.weakTopicsJson || "None detected"}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deck Builder</CardTitle>
            <CardDescription>Create cards from study topics and run quick rounds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="deckTitle">New deck title</Label>
            <Input id="deckTitle" value={deckTitle} onChange={(e) => setDeckTitle(e.target.value)} placeholder="Biology exam topics" />
            <Button
              className="w-full"
              onClick={() => createDeckMutation.mutate()}
              disabled={deckTitle.trim().length < 2 || createDeckMutation.isPending}
            >
              Create Deck
            </Button>
            <div className="space-y-2">
              <Label>Decks</Label>
              {decks.map((deck) => (
                <Button
                  key={deck.id}
                  variant={selectedDeckId === deck.id ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSelectedDeckId(deck.id)}
                >
                  {deck.title}
                </Button>
              ))}
            </div>
            <Label htmlFor="cardPrompt">Card prompt</Label>
            <Textarea id="cardPrompt" value={cardPrompt} onChange={(e) => setCardPrompt(e.target.value)} />
            <Label htmlFor="cardAnswer">Card answer</Label>
            <Textarea id="cardAnswer" value={cardAnswer} onChange={(e) => setCardAnswer(e.target.value)} />
            <Label htmlFor="cardTopic">Topic (optional)</Label>
            <Input id="cardTopic" value={cardTopic} onChange={(e) => setCardTopic(e.target.value)} />
            <Button
              className="w-full"
              onClick={() => createCardMutation.mutate()}
              disabled={!selectedDeckId || cardPrompt.trim().length < 2 || cardAnswer.trim().length < 1 || createCardMutation.isPending}
            >
              Add Card
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Game Registry</CardTitle>
          <CardDescription>Current and upcoming study mini-games in this sub-experience layer.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {GAMES_REGISTRY.map((game) => (
            <Badge key={game.id} variant={game.status === "live" ? "default" : "secondary"}>
              {game.title} - {game.status}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
