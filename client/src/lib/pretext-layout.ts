export type PreparedSegment = {
  token: string;
  width: number;
};

export type PreparedText = {
  segments: PreparedSegment[];
  font: string;
};

function getContext(font: string): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  return ctx;
}

export function prepareText(text: string, font = "14px Inter, system-ui"): PreparedText {
  const ctx = getContext(font);
  const tokens = text.split(/(\s+)/).filter(Boolean);
  const segments = tokens.map((token) => ({
    token,
    width: ctx ? ctx.measureText(token).width : token.length * 7,
  }));
  return { segments, font };
}

export function layoutPreparedText(prepared: PreparedText, maxWidth: number, lineHeight = 20): { lines: number; height: number } {
  if (maxWidth <= 0) return { lines: 0, height: 0 };
  let lines = 1;
  let current = 0;
  for (const segment of prepared.segments) {
    if (current + segment.width > maxWidth && current > 0) {
      lines += 1;
      current = segment.width;
      continue;
    }
    current += segment.width;
  }
  return { lines, height: lines * lineHeight };
}

export function estimateTextLayout(text: string, maxWidth: number, font = "14px Inter, system-ui", lineHeight = 20) {
  const prepared = prepareText(text, font);
  return layoutPreparedText(prepared, maxWidth, lineHeight);
}

export function benchmarkPretext(samples: string[], maxWidth: number) {
  const start = performance.now();
  let lines = 0;
  for (const sample of samples) {
    lines += estimateTextLayout(sample, maxWidth).lines;
  }
  const end = performance.now();
  return {
    sampleCount: samples.length,
    totalLines: lines,
    elapsedMs: Number((end - start).toFixed(2)),
  };
}
