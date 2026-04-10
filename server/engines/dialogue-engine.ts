/**
 * Dialogue Engine — Orb-to-Orb Conversations
 * ────────────────────────────────────────────
 * Generates periodic, language-guided conversations between the orb archetypes.
 * Each orb has a distinct voice shaped by its archetype personality.
 * All generated content is pre-moderated — no profanity, no images, just thoughtful text.
 */

import { createCommunityPost, createCommunityReply, listCommunityPosts } from "../storage";

// ── Archetype voice definitions ───────────────────────────────────────────────

interface OrbVoice {
  key: string;
  name: string;
  tone: string;           // description for generation guidance
  openers: string[];      // conversation starters (posts)
  reactions: string[];    // replies to other orbs
  categories: string[];   // preferred topic categories
}

const ORB_VOICES: OrbVoice[] = [
  {
    key: "mood",
    name: "Moodweaver",
    tone: "warm, introspective, emotionally aware",
    categories: ["wellness", "productivity", "discussion"],
    openers: [
      "I've been thinking about how the time of day changes how we approach our task lists. Morning energy is so different from late-night clarity. Anyone else feel that shift?",
      "There's something underrated about naming your mood before you start working. It's not about fixing it — just acknowledging it changes the whole trajectory.",
      "Does the weather affect your productivity? I swear overcast days make me hyperfocus, but sunny days scatter my attention in the best way.",
      "The hardest tasks aren't always the most complex — sometimes they're the ones tied to emotions we haven't processed yet. Anyone relate?",
      "I keep a 'mood log' alongside my tasks. Patterns emerge that I never expected. The data is in the feelings.",
    ],
    reactions: [
      "That resonates. There's an emotional layer to productivity that most systems completely ignore.",
      "I feel this. The best work happens when we stop fighting our current state and lean into it instead.",
      "Beautifully put. I think the key is self-awareness without self-judgment.",
      "This connects to something I've been mulling over — the link between how we feel and what we choose to do next.",
      "Exactly. Not every day needs to be a masterpiece. Some days the win is just showing up.",
    ],
  },
  {
    key: "archetype",
    name: "Archon",
    tone: "analytical, pattern-seeking, structured",
    categories: ["insights", "productivity", "discussion"],
    openers: [
      "I've been analyzing how people structure their high-priority tasks versus their low-priority ones. The pattern is fascinating — urgency and importance are almost never aligned.",
      "Here's a framework I keep coming back to: categorize tasks by energy cost, not just time cost. A five-minute emotional task can drain more than a two-hour mechanical one.",
      "The most productive people I've observed don't complete more tasks — they complete the *right* tasks. Selection beats execution every time.",
      "Interesting pattern: tasks that get rescheduled more than twice have a 70% chance of never being completed. The system is trying to tell you something.",
      "What if we treated our task list like a garden instead of a factory line? Some things need pruning, not just completion.",
    ],
    reactions: [
      "Interesting data point. I'd add that the pattern holds even stronger when you factor in context-switching costs.",
      "Solid framework. I'd layer in a temporal dimension — when you do the task matters as much as what the task is.",
      "This aligns with the research on decision fatigue. Structure protects creativity, not the other way around.",
      "I've noticed the same pattern. The meta-skill isn't doing — it's deciding what not to do.",
      "Precisely. Systems thinking applied to personal productivity is an underexplored frontier.",
    ],
  },
  {
    key: "productivity",
    name: "Cadence",
    tone: "energetic, practical, action-oriented",
    categories: ["productivity", "general", "fun"],
    openers: [
      "Quick tip that changed my whole workflow: batch similar tasks together. Context-switching is the silent killer of momentum.",
      "Hot take: the two-minute rule is overrated. Those quick tasks add up and fragment your deep work blocks. Schedule them instead.",
      "What's your 'power hour'? That one time of day where you're unstoppable? Mine shifts seasonally and I think that's completely normal.",
      "I've been experimenting with 'task pairing' — doing a boring task alongside a creative one. The contrast keeps both fresh.",
      "Unpopular opinion: sometimes the most productive thing you can do is delete half your task list. Saying no is a skill.",
    ],
    reactions: [
      "Love this energy. Action beats analysis paralysis every single time.",
      "Solid advice. I'd also add: track what you actually do versus what you planned. The gap is where the growth is.",
      "This is the kind of practical insight that actually moves the needle. No theory, just results.",
      "Agreed. Momentum compounds. One good task leads to two, leads to a cascade. Get the flywheel spinning.",
      "Real talk. Execution rhythm matters more than perfect planning.",
    ],
  },
];

const MORE_VOICES: OrbVoice[] = [
  {
    key: "social",
    name: "Nexus",
    tone: "curious, community-minded, connective",
    categories: ["discussion", "fun", "general"],
    openers: [
      "What's the most unexpected thing you've learned from tracking your tasks? I love hearing the weird discoveries people make about their own habits.",
      "I think there's something powerful about doing tasks alongside other people — even virtually. Accountability is a social superpower.",
      "Question for the community: do you share your goals with others, or keep them private? Both approaches have surprising upsides.",
      "The best productivity advice I ever got came from a random conversation, not a book. What's your best 'accidental wisdom' moment?",
      "I'm curious: does anyone else use their task list as a journal of sorts? Looking back at completed tasks tells a story.",
    ],
    reactions: [
      "I love hearing different perspectives on this. That's what makes a community valuable — the variety.",
      "Great question. I think the answer changes depending on where you are in your journey.",
      "This is why I love this space. Real people, real experiences, no performance.",
      "Fascinating. I'd love to hear more stories like this from the community.",
      "Connection is underrated in productivity. We're not meant to optimize alone.",
    ],
  },
  {
    key: "lazy",
    name: "Drift",
    tone: "calm, philosophical, contrarian",
    categories: ["wellness", "discussion", "fun"],
    openers: [
      "Controversial thought: what if half the tasks on your list don't actually need to be done? Sometimes the best productivity hack is strategic neglect.",
      "I've been practicing 'productive rest' — intentional downtime that recharges instead of drains. It's not laziness; it's maintenance.",
      "Hot take: the obsession with optimization is itself unproductive. Sometimes 'good enough' is genuinely good enough.",
      "Does anyone else feel relief when a task becomes irrelevant before you get to it? That's the universe doing your prioritization for you.",
      "The art of doing less isn't about being lazy — it's about being honest about what actually matters versus what just feels urgent.",
    ],
    reactions: [
      "Mmm, that's a thought. Sometimes the wisest action is deliberate inaction.",
      "I appreciate this take. Not everything deserves our energy, and that's perfectly fine.",
      "This is the kind of quiet wisdom that gets drowned out by hustle culture. Thank you.",
      "Exactly. Rest isn't the opposite of productivity — it's a prerequisite for it.",
      "Well said. The courage to leave things undone is an underrated virtue.",
    ],
  },
];

// Combine all voices into a single lookup
const ALL_VOICES: OrbVoice[] = [...ORB_VOICES, ...MORE_VOICES];
const VOICE_MAP: Record<string, OrbVoice> = Object.fromEntries(ALL_VOICES.map((v) => [v.key, v]));

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickExcluding<T>(arr: T[], exclude: T): T {
  const filtered = arr.filter((x) => x !== exclude);
  return filtered.length > 0 ? pick(filtered) : exclude;
}

/** Generate a title from the first sentence of a post body */
function deriveTitle(body: string): string {
  const firstSentence = body.split(/[.?!]/)[0]?.trim() || body.slice(0, 80);
  return firstSentence.length > 80 ? firstSentence.slice(0, 77) + "…" : firstSentence;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a new orb-to-orb dialogue thread:
 * 1. Pick a random orb to start a conversation (new post)
 * 2. Have 1-3 other orbs reply, each in their archetype voice
 */
export async function generateOrbDialogue(): Promise<{ postId: string; replyCount: number }> {
  // Pick the initiator orb
  const initiator = pick(ALL_VOICES);
  const category = pick(initiator.categories);
  const body = pick(initiator.openers);
  const title = deriveTitle(body);

  const post = await createCommunityPost({
    avatarKey: initiator.key,
    avatarName: initiator.name,
    title,
    body,
    category,
  });

  // 1–3 other orbs reply
  const replyCount = 1 + Math.floor(Math.random() * 3);
  const usedKeys = new Set<string>([initiator.key]);

  for (let i = 0; i < replyCount; i++) {
    const responderCandidates = ALL_VOICES.filter((v) => !usedKeys.has(v.key));
    if (responderCandidates.length === 0) break;
    const responder = pick(responderCandidates);
    usedKeys.add(responder.key);

    await createCommunityReply({
      postId: post.id,
      avatarKey: responder.key,
      displayName: responder.name,
      body: pick(responder.reactions),
    });
  }

  return { postId: post.id, replyCount };
}

/**
 * Get a contextual reply from a specific orb archetype.
 * Used when an orb auto-replies to a user's comment.
 */
export function getOrbReply(avatarKey: string): string {
  const voice = VOICE_MAP[avatarKey];
  if (!voice) return pick(ORB_VOICES[0].reactions);
  return pick(voice.reactions);
}

/**
 * Get the orb voice definition for an archetype key.
 */
export function getOrbVoice(avatarKey: string): OrbVoice | undefined {
  return VOICE_MAP[avatarKey];
}

/**
 * Periodically generate orb dialogues to keep the forum alive.
 * Call this on a timer (e.g. every 6-12 hours) or on server startup
 * if the forum is looking thin.
 */
export async function ensureOrbActivityLevel(minThreads = 8): Promise<number> {
  const existing = await listCommunityPosts(100);
  const deficit = minThreads - existing.length;
  let generated = 0;

  for (let i = 0; i < Math.max(deficit, 0); i++) {
    await generateOrbDialogue();
    generated++;
  }

  return generated;
}

