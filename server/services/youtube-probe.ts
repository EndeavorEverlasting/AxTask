import { getOrRecomputeEntourage, type EntourageCompanion } from "../engines/entourage-engine";
import {
  getDominantClassificationForUser,
  getUserYoutubeProbeState,
  upsertUserYoutubeProbeState,
  insertYoutubeProbeFeedback,
  storage,
} from "../storage";
import { callNodeWeaverBatchClassify } from "./classification/nodeweaver-client";
import { isGeneralClassification } from "@shared/classification-catalog";
import type { Task } from "@shared/schema";

export const YOUTUBE_PROBE_VERSION = "1";

export type YoutubeProbeReaction = "interested" | "not_interested" | "dismiss";

export type YoutubeProbeContextSnapshot = {
  probeVersion: string;
  moodKey?: string;
  archetypeKey?: string;
  productivityKey?: string;
  socialKey?: string;
  dominantClassification: string | null;
  searchQuery: string;
  nodeweaverCategory?: string;
  nodeweaverTopicHint?: string;
};

export type YoutubeProbeNextResponse =
  | {
      available: true;
      video: {
        videoId: string;
        title: string;
        channelTitle: string;
        thumbnailUrl: string;
        watchUrl: string;
      };
      probeContext: string;
      probeVersion: string;
      contextSnapshot: YoutubeProbeContextSnapshot;
    }
  | {
      available: false;
      reason: "cooldown" | "unconfigured" | "youtube_error" | "no_results";
      message?: string;
      cooldownUntil?: string;
    };

function probeCooldownMs(): number {
  const raw = process.env.YOUTUBE_PROBE_COOLDOWN_HOURS;
  const n = raw === undefined || raw === "" ? 24 : Number(raw);
  const hours = Number.isFinite(n) && n >= 0 ? n : 24;
  return hours * 60 * 60 * 1000;
}

function companionKey(companions: EntourageCompanion[], slot: EntourageCompanion["slot"]): string | undefined {
  return companions.find((c) => c.slot === slot)?.key;
}

function scrubSnippet(text: string, maxLen: number): string {
  let s = text;
  s = s.replace(/\S+@\S+\.\S+/g, " ");
  s = s.replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, " ");
  s = s.replace(/\b\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,9}\b/g, " ");
  s = s.replace(/\b\d{3}-\d{2}-\d{4}\b/g, " ");
  s = s.replace(/\b\d{9,}\b/g, " ");
  s = s.replace(/\b\d{1,3}\s+[A-Za-z0-9.'-]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/gi, " ");
  s = s.replace(/\b(?:ZIP|zipcode|postal)\s*:?\s*\d{5}(?:-\d{4})?\b/gi, " ");
  s = s.replace(/\b\d{5}(?:-\d{4})?\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, maxLen);
}

async function fetchNodeweaverHints(probeText: string): Promise<{ category?: string; topicHint?: string }> {
  if (!process.env.NODEWEAVER_URL?.trim()) return {};
  const trimmed = probeText.trim().slice(0, 500);
  if (!trimmed) return {};
  try {
    const raw = (await callNodeWeaverBatchClassify([
      { id: "youtube-probe-context", activity: trimmed, notes: "" },
    ])) as {
      results?: Array<{
        predicted_category?: string;
        similar_topics?: Array<{ title?: string; name?: string; topic_name?: string }>;
      }>;
    };
    const r0 = raw?.results?.[0];
    if (!r0) return {};
    const category = typeof r0.predicted_category === "string" ? r0.predicted_category.trim() : undefined;
    const st0 = r0.similar_topics?.[0];
    const topicHint =
      st0 &&
      String(st0.title || st0.name || st0.topic_name || "")
        .trim()
        .slice(0, 80);
    return { category, topicHint: topicHint || undefined };
  } catch {
    return {};
  }
}

type YtSearchItem = {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } };
};

const YOUTUBE_SEARCH_TIMEOUT_MS = 5000;

async function youtubeSearchList(q: string, apiKey: string): Promise<YtSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "12",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    q: q.slice(0, 200),
    key: apiKey,
  });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), YOUTUBE_SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("YouTube search aborted/timed out");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube search failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { items?: YtSearchItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

function pickVideo(
  items: YtSearchItem[],
  avoidVideoId: string | null,
): { videoId: string; title: string; channelTitle: string; thumbnailUrl: string } | null {
  for (const it of items) {
    const id = it.id?.videoId;
    if (!id || !/^[a-zA-Z0-9_-]{6,}$/.test(id)) continue;
    if (avoidVideoId && id === avoidVideoId) continue;
    const title = (it.snippet?.title || "Video").trim().slice(0, 200);
    const channelTitle = (it.snippet?.channelTitle || "").trim().slice(0, 120);
    const thumbnailUrl = it.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    return { videoId: id, title, channelTitle, thumbnailUrl };
  }
  if (avoidVideoId) {
    return pickVideo(items, null);
  }
  return null;
}

export async function getNextYoutubeProbe(
  userId: string,
  opts: { shareTaskText?: boolean } = {},
): Promise<YoutubeProbeNextResponse> {
  const shareTaskText = opts.shareTaskText === true;
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return { available: false, reason: "unconfigured", message: "YouTube recommendations are not configured." };
  }

  const state = await getUserYoutubeProbeState(userId);
  const lastAt = state?.lastOfferedAt ? new Date(state.lastOfferedAt).getTime() : 0;
  const cooldown = probeCooldownMs();
  if (lastAt > 0 && Date.now() - lastAt < cooldown) {
    const cooldownUntil = new Date(lastAt + cooldown).toISOString();
    return {
      available: false,
      reason: "cooldown",
      cooldownUntil,
      message: "A new pick will be available after the cooldown.",
    };
  }

  const [entourage, dominantRaw, tasks] = await Promise.all([
    getOrRecomputeEntourage(userId, false),
    getDominantClassificationForUser(userId),
    shareTaskText ? storage.getRecentTasksByUpdatedAt(userId, 5) : Promise.resolve([] as Task[]),
  ]);

  const companions = entourage.companions;
  const moodKey = companionKey(companions, "mood");
  const archetypeKey = companionKey(companions, "archetype");
  const productivityKey = companionKey(companions, "productivity");
  const socialKey = companionKey(companions, "social");

  const dominant =
    dominantRaw && !isGeneralClassification(dominantRaw) ? dominantRaw.trim() : null;

  const recentTasks = tasks;
  const taskBits = shareTaskText
    ? recentTasks
        .map((t) => scrubSnippet(t.activity || "", 48))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const nwProbeParts = ([moodKey, archetypeKey, dominant] as (string | undefined)[])
    .concat(shareTaskText ? taskBits : [])
    .filter(Boolean) as string[];
  const nwHints = await fetchNodeweaverHints(nwProbeParts.join(". "));

  const queryTokens: string[] = [
    "productivity",
    moodKey?.replace(/_/g, " "),
    archetypeKey?.replace(/_/g, " "),
    productivityKey?.replace(/_/g, " "),
    socialKey?.replace(/_/g, " "),
    dominant || undefined,
    nwHints.category,
    nwHints.topicHint,
    ...(shareTaskText ? taskBits : []),
  ].filter((x): x is string => !!x && x.length > 1);

  const searchQuery = Array.from(new Set(queryTokens.map((t) => t.trim()).filter(Boolean)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  if (!searchQuery) {
    return { available: false, reason: "no_results", message: "Not enough context to suggest a video yet." };
  }

  let items: Awaited<ReturnType<typeof youtubeSearchList>>;
  try {
    items = await youtubeSearchList(searchQuery, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "YouTube request failed";
    return { available: false, reason: "youtube_error", message: msg };
  }

  const picked = pickVideo(items, state?.lastVideoId ?? null);
  if (!picked) {
    return { available: false, reason: "no_results", message: "No matching videos found." };
  }

  const contextSnapshot: YoutubeProbeContextSnapshot = {
    probeVersion: YOUTUBE_PROBE_VERSION,
    moodKey,
    archetypeKey,
    productivityKey,
    socialKey,
    dominantClassification: dominant,
    searchQuery,
    nodeweaverCategory: nwHints.category,
    nodeweaverTopicHint: nwHints.topicHint,
  };

  const moodLabel = companions.find((c) => c.slot === "mood")?.label ?? "your rhythm";
  const archLabel = companions.find((c) => c.slot === "archetype")?.label ?? "your work style";
  const probeContext = [
    `Based on your AxTask signals — mood “${moodLabel}”, ${archLabel.toLowerCase()}${dominant ? `, and tasks leaning toward “${dominant}”` : ""}`,
    nwHints.category ? ` — plus topic cues (“${nwHints.category}”) from classification` : "",
    " — here is a short video you might like.",
  ].join("");

  const now = new Date();
  await upsertUserYoutubeProbeState(userId, picked.videoId, now);

  return {
    available: true,
    video: {
      ...picked,
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(picked.videoId)}`,
    },
    probeContext,
    probeVersion: YOUTUBE_PROBE_VERSION,
    contextSnapshot,
  };
}

export async function recordYoutubeProbeFeedback(opts: {
  userId: string;
  videoId: string;
  reaction: YoutubeProbeReaction;
  contextSnapshot?: Record<string, unknown> | null;
}): Promise<void> {
  let json: string | null = null;
  if (opts.contextSnapshot && typeof opts.contextSnapshot === "object") {
    try {
      const serialized = JSON.stringify(opts.contextSnapshot);
      json =
        serialized.length > 16000
          ? JSON.stringify({ _truncated: true, originalLength: serialized.length })
          : serialized;
    } catch {
      json = null;
    }
  }
  await insertYoutubeProbeFeedback({
    userId: opts.userId,
    videoId: opts.videoId.trim(),
    reaction: opts.reaction,
    probeVersion: YOUTUBE_PROBE_VERSION,
    contextSnapshotJson: json,
  });
}
