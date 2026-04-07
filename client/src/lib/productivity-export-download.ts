import { apiFetch } from "@/lib/queryClient";

export type ProductivityExportPrices = {
  checklistPdf: number;
  tasksSpreadsheet: number;
  taskReportPdf: number;
  taskReportXlsx: number;
  freeInDev: boolean;
};

export function parseFilenameFromContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i.exec(header);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return m[1].trim();
  }
}

type PaidDownloadOk = { ok: true; blob: Blob; filename?: string };
type PaidDownloadErr = {
  ok: false;
  status: number;
  insufficientCoins?: { required: number; balance: number; message?: string };
  message?: string;
};

export async function postPaidDownload(path: string, body: object): Promise<PaidDownloadOk | PaidDownloadErr> {
  const res = await apiFetch("POST", path, body);
  const cd = res.headers.get("content-disposition");
  const filename = parseFilenameFromContentDisposition(cd);

  if (res.status === 402) {
    try {
      const j = (await res.json()) as {
        code?: string;
        required?: number;
        balance?: number;
        message?: string;
      };
      if (j.code === "INSUFFICIENT_COINS" && typeof j.required === "number" && typeof j.balance === "number") {
        return {
          ok: false,
          status: 402,
          insufficientCoins: { required: j.required, balance: j.balance, message: j.message },
        };
      }
    } catch {
      /* fall through */
    }
    return { ok: false, status: 402, message: "Not enough AxCoins." };
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let message: string | undefined;
    try {
      const j = JSON.parse(txt) as { message?: string };
      message = typeof j?.message === "string" ? j.message : undefined;
    } catch {
      message = txt.trim() || res.statusText;
    }
    return { ok: false, status: res.status, message };
  }

  const blob = await res.blob();
  return { ok: true, blob, filename };
}

export function triggerBlobDownload(blob: Blob, fallbackFilename: string, filename?: string) {
  const name = filename || fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
