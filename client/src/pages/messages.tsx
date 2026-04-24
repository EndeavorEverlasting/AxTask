import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decryptDmUtf8, encryptDmUtf8, generateDmDeviceIdentity } from "@/lib/e2ee-dm-crypto";
import { loadDmDeviceState, saveDmDeviceState } from "@/lib/e2ee-device-storage";
import { parseApiRequestError, participationAgeUserHint } from "@/lib/parse-api-request-error";
import QRCode from "qrcode";

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

type DmRow = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  senderPubSpkiB64: string;
  /** Present on new messages; used so the sender can decrypt their own sends after peer key rotation. */
  recipientPubSpkiB64?: string | null;
  ciphertextB64: string;
  nonceB64: string;
  contentEncoding: string;
  createdAt: string | null;
};

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deviceReady, setDeviceReady] = useState(false);
  const [peerIdentifier, setPeerIdentifier] = useState("");
  const [shareQrDataUrl, setShareQrDataUrl] = useState<string>("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [cryptoKeys, setCryptoKeys] = useState<{
    deviceId: string;
    privateKey: CryptoKey;
    publicKey: CryptoKey;
    publicKeySpkiPem: string;
  } | null>(null);

  const ensureDevice = useCallback(async () => {
    if (!user) return;
    let state = await loadDmDeviceState();
    if (!state) {
      const { keyPair, publicKeySpkiPem } = await generateDmDeviceIdentity();
      const deviceId = crypto.randomUUID();
      const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
      await saveDmDeviceState({
        deviceId,
        privateKeyJwkJson: JSON.stringify(jwk),
        publicKeySpkiPem,
      });
      state = {
        deviceId,
        privateKeyJwkJson: JSON.stringify(jwk),
        publicKeySpkiPem,
      };
    }
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(state.privateKeyJwkJson) as JsonWebKey,
      ECDH,
      true,
      ["deriveBits"],
    );
    const publicKey = await crypto.subtle.importKey(
      "spki",
      pemToDer(state.publicKeySpkiPem),
      ECDH,
      false,
      [],
    );
    await apiRequest("POST", "/api/e2ee/devices", {
      deviceId: state.deviceId,
      publicKeySpki: state.publicKeySpkiPem,
      label: "browser",
    });
    setCryptoKeys({
      deviceId: state.deviceId,
      privateKey,
      publicKey,
      publicKeySpkiPem: state.publicKeySpkiPem,
    });
    setDeviceReady(true);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void ensureDevice().catch((e) => {
      const p = parseApiRequestError(e);
      toast({
        title: "E2EE device setup failed",
        description: p.message + participationAgeUserHint(p.code),
        variant: "destructive",
      });
    });
  }, [user, ensureDevice, toast]);

  const { data: convData } = useQuery({
    queryKey: ["/api/dm/conversations"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/dm/conversations");
      return r.json() as Promise<{
        conversations: Array<{ id: string; peerHandle: string | null }>;
      }>;
    },
    enabled: Boolean(user && deviceReady),
  });

  const { data: shareIdentity } = useQuery({
    queryKey: ["/api/dm/public-identity"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/dm/public-identity");
      return r.json() as Promise<{ publicHandle: string; publicDmToken: string }>;
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    const token = shareIdentity?.publicDmToken;
    if (!token) {
      setShareQrDataUrl("");
      return;
    }
    const payload = `axtask-dm:${token}`;
    void QRCode.toDataURL(payload, { margin: 1, width: 180 })
      .then(setShareQrDataUrl)
      .catch(() => setShareQrDataUrl(""));
  }, [shareIdentity?.publicDmToken]);

  const { data: msgData } = useQuery({
    queryKey: ["/api/dm/conversations", activeConversationId, "messages"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/dm/conversations/${activeConversationId}/messages`);
      return r.json() as Promise<{ messages: DmRow[] }>;
    },
    enabled: Boolean(activeConversationId && deviceReady),
  });

  const createConv = useMutation({
    mutationFn: async (peerRaw: string) => {
      const peer = peerRaw.trim();
      const normalizedToken = peer.startsWith("axtask-dm:") ? peer.slice("axtask-dm:".length).trim() : peer;
      const payload = normalizedToken.length >= 16 && !normalizedToken.startsWith("@")
        ? { peerDmToken: normalizedToken }
        : { peerHandle: peer.replace(/^@+/, "") };
      const r = await apiRequest("POST", "/api/dm/conversations", payload);
      return r.json() as Promise<{ conversationId: string }>;
    },
    onSuccess: (d) => {
      setActiveConversationId(d.conversationId);
      void queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
      toast({ title: "Conversation ready", description: "You can send an encrypted message." });
    },
    onError: (e: Error) => {
      const p = parseApiRequestError(e);
      toast({
        title: "Could not start DM",
        description: p.message + participationAgeUserHint(p.code),
        variant: "destructive",
      });
    },
  });

  const sendMsg = useMutation({
    mutationFn: async () => {
      if (!activeConversationId || !cryptoKeys || !user) throw new Error("Not ready");
      const devRes = await apiRequest("GET", `/api/e2ee/conversations/${activeConversationId}/peer-devices`);
      const devJson = (await devRes.json()) as { devices: Array<{ publicKeySpki: string }> };
      // Server returns devices ordered by lastSeenAt desc; encrypt to the most recently active device.
      const peerSpki = devJson.devices[0]?.publicKeySpki;
      if (!peerSpki) throw new Error("Peer has not registered an E2EE device key yet.");
      const enc = await encryptDmUtf8(cryptoKeys.privateKey, cryptoKeys.publicKey, peerSpki, draft);
      const r = await apiRequest("POST", `/api/dm/conversations/${activeConversationId}/messages`, {
        ciphertextB64: enc.ciphertextB64,
        nonceB64: enc.nonceB64,
        senderPubSpkiB64: enc.senderPubSpkiB64,
        recipientPubSpkiB64: enc.recipientPubSpkiB64,
      });
      return r.json();
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({
        queryKey: ["/api/dm/conversations", activeConversationId, "messages"],
      });
    },
    onError: (e: Error) => {
      const p = parseApiRequestError(e);
      toast({
        title: "Send failed",
        description: p.message + participationAgeUserHint(p.code),
        variant: "destructive",
      });
    },
  });

  const conversations = convData?.conversations ?? [];
  const messages = msgData?.messages ?? [];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <PretextPageHeader
        eyebrow="E2EE"
        title="Direct messages"
        subtitle="End-to-end encrypted with ECDH P-256 and AES-GCM in your browser. The server stores ciphertext only."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/privacy">Privacy</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Device key</CardTitle>
          <CardDescription>
            A key pair is created in this browser and registered on the server (public key only). Product contract:{" "}
            <code className="text-xs">docs/E2EE_PRODUCT.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {deviceReady && cryptoKeys ? (
            <p>
              Ready — device <span className="font-mono text-xs">{cryptoKeys.deviceId.slice(0, 8)}…</span>
            </p>
          ) : (
            <p>Preparing encryption keys…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My secure contact card</CardTitle>
          <CardDescription>
            Share your public handle or invite token. Internal peer and device IDs stay backend-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Handle: <span className="font-mono">@{shareIdentity?.publicHandle ?? "…"}</span>
          </p>
          <p>
            Invite token: <span className="font-mono text-xs break-all">{shareIdentity?.publicDmToken ?? "…"}</span>
          </p>
          {shareQrDataUrl ? (
            <img src={shareQrDataUrl} alt="DM invite QR" className="h-40 w-40 rounded border bg-white p-1" />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start or open a conversation</CardTitle>
          <CardDescription>
            Enter the other user&apos;s public handle (for example @ax_user) or DM invite token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="peer">Peer handle or invite</Label>
            <Input
              id="peer"
              value={peerIdentifier}
              onChange={(e) => setPeerIdentifier(e.target.value)}
              placeholder="@handle or axtask-dm:token"
              className="font-mono text-sm"
            />
          </div>
          <Button
            type="button"
            disabled={!deviceReady || createConv.isPending}
            onClick={() => {
              const t = peerIdentifier.trim();
              if (!t) return;
              createConv.mutate(t);
            }}
          >
            {createConv.isPending ? "Starting…" : "Start / open DM"}
          </Button>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Your conversations</p>
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`text-sm underline-offset-2 hover:underline ${activeConversationId === c.id ? "text-primary font-medium" : ""}`}
                    onClick={() => setActiveConversationId(c.id)}
                  >
                    {c.id.slice(0, 8)}… {c.peerHandle ? `↔ @${c.peerHandle}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>Plaintext is only in memory in your browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!activeConversationId ? (
            <p className="text-sm text-muted-foreground">Select or create a conversation.</p>
          ) : (
            <>
              <ul className="space-y-2 border rounded-md p-3 max-h-64 overflow-y-auto text-sm">
                {messages.map((m) => (
                  <li key={m.id} className="whitespace-pre-wrap break-words">
                    <span className="text-muted-foreground text-xs">
                      {m.direction === "out" ? "You" : "Peer"}:
                    </span>{" "}
                    <DecryptLine m={m} conversationId={activeConversationId} cryptoKeys={cryptoKeys} />
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <Label htmlFor="dm-draft">Message</Label>
                <Input
                  id="dm-draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim() && !sendMsg.isPending) sendMsg.mutate();
                    }
                  }}
                />
                <Button type="button" disabled={!draft.trim() || sendMsg.isPending} onClick={() => sendMsg.mutate()}>
                  {sendMsg.isPending ? "Sending…" : "Send encrypted"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function pemToDer(pem: string): ArrayBuffer {
  const trimmed = pem.trim();
  const b64 = trimmed
    .replace(/-----BEGIN PUBLIC KEY-----/i, "")
    .replace(/-----END PUBLIC KEY-----/i, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufToB64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function DecryptLine({
  m,
  conversationId,
  cryptoKeys,
}: {
  m: DmRow;
  conversationId: string;
  cryptoKeys: { privateKey: CryptoKey; publicKey: CryptoKey; publicKeySpkiPem: string } | null;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!cryptoKeys) return;
    let cancelled = false;
    void (async () => {
      try {
        let otherB64 = m.senderPubSpkiB64;
        if (m.direction === "out") {
          if (m.recipientPubSpkiB64) {
            otherB64 = m.recipientPubSpkiB64.trim();
          } else {
            // Legacy rows: approximate peer key at decrypt time (may fail if peer rotated keys).
            const devRes = await fetch(`/api/e2ee/conversations/${conversationId}/peer-devices`, { credentials: "include" });
            if (!devRes.ok) throw new Error("no peer key");
            const j = (await devRes.json()) as { devices: Array<{ publicKeySpki: string }> };
            const spki = j.devices[0]?.publicKeySpki;
            if (!spki) throw new Error("no peer key");
            const pub = await crypto.subtle.importKey("spki", pemToDer(spki), ECDH, false, []);
            const der = await crypto.subtle.exportKey("spki", pub);
            otherB64 = bufToB64(der);
          }
        }
        const out = await decryptDmUtf8(cryptoKeys.privateKey, otherB64, m.ciphertextB64, m.nonceB64);
        if (!cancelled) {
          setText(out);
          setErr("");
        }
      } catch {
        if (!cancelled) {
          setText("");
          setErr("[Could not decrypt]");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    m.id,
    m.direction,
    m.ciphertextB64,
    m.nonceB64,
    m.senderPubSpkiB64,
    m.recipientPubSpkiB64,
    conversationId,
    cryptoKeys,
  ]);

  if (err) return <span className="text-destructive">{err}</span>;
  return <span>{text || "…"}</span>;
}
