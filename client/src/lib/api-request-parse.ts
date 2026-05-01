export type ParsedApiRequestError = {
  status?: number;
  message: string;
  code?: string;
};

/** Parses errors thrown by {@link apiRequest} (`${status}: ${body}`). */
export function parseApiRequestError(err: unknown): ParsedApiRequestError {
  if (!(err instanceof Error)) return { message: String(err) };
  const m = /^(\d{3}):\s*([\s\S]*)$/.exec(err.message);
  if (!m) return { message: err.message };
  const status = parseInt(m[1], 10);
  const raw = m[2].trim();
  try {
    const j = JSON.parse(raw) as { message?: string; code?: string };
    if (typeof j.message === "string") {
      return {
        status,
        message: j.message,
        code: typeof j.code === "string" ? j.code : undefined,
      };
    }
  } catch {
    /* body was not JSON */
  }
  return { status, message: raw || err.message };
}

export function participationAgeUserHint(code: string | undefined): string {
  if (code === "birth_date_required" || code === "under_age") {
    return " Set your date of birth under Profile or Account if you are eligible to participate.";
  }
  return "";
}
