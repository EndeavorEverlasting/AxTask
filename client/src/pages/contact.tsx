import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PretextShell } from "@/components/pretext/pretext-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const contactEmailRaw = import.meta.env.VITE_CONTACT_EMAIL;
const contactEmail =
  typeof contactEmailRaw === "string" && contactEmailRaw.trim() !== ""
    ? contactEmailRaw.trim()
    : undefined;

export default function ContactPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const embedded = !!user;

  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/public/contact", {
        message: message.trim(),
        email: email.trim() || undefined,
        name: name.trim() || undefined,
        website: honeypot || undefined,
      });
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: (data) => {
      setMessage("");
      setEmail("");
      setName("");
      setHoneypot("");
      toast({
        title: "Message sent",
        description: data.message ?? "Thanks — our team can review it in the admin feedback inbox.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not send", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = message.trim().length >= 10 && !submitMutation.isPending;

  const formCard = (
    <Card className={embedded ? "" : "border border-gray-200 dark:border-gray-700 shadow-lg"}>
      <CardHeader>
        <CardTitle>Send a message</CardTitle>
        <CardDescription>
          Anyone can write here — no account required. Submissions are classified automatically and appear in the same{" "}
          <strong className="font-medium text-foreground">admin feedback inbox</strong> as in-app feedback. Optional
          email helps us reply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            submitMutation.mutate();
          }}
        >
        {user ? (
          <p className="text-sm text-muted-foreground">
            You&apos;re signed in — we&apos;ll link this message to your account. For screenshots, use{" "}
            <Link href="/feedback" className="text-primary font-medium hover:underline">
              Feedback
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            We may add lightweight verification (for example email or MFA challenges) later if abuse appears — the
            channel stays open for real visitors.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="contact-message">Message</Label>
          <Textarea
            id="contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What should we know? (at least 10 characters)"
            className="min-h-[140px] resize-y"
            maxLength={5000}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contact-email">Your email (optional)</Label>
            <Input
              id="contact-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-name">Name (optional)</Label>
            <Input
              id="contact-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How we should address you"
              maxLength={120}
            />
          </div>
        </div>
        <div className="sr-only" aria-hidden>
          <label htmlFor="contact-website">Leave blank</label>
          <input
            id="contact-website"
            tabIndex={-1}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={!canSubmit}
        >
          <Send className="mr-2 h-4 w-4" />
          {submitMutation.isPending ? "Sending…" : "Send to team"}
        </Button>
        </form>
      </CardContent>
    </Card>
  );

  const explainerCard = (
    <Card className={embedded ? "" : "border border-gray-200 dark:border-gray-700 shadow-lg"}>
      <CardHeader>
        <CardTitle>Transactional email (sign-in, MFA, etc.)</CardTitle>
        <CardDescription>
          Providers such as Resend recommend verifying a{" "}
          <strong className="font-medium text-foreground">subdomain</strong> for outbound mail (for example{" "}
          <code className="text-xs">mail.example.com</code>) so deliverability issues stay off your root domain. Set{" "}
          <code className="text-xs">RESEND_FROM</code> on the server to an address on that subdomain after DNS
          verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
        <p>
          That subdomain is for <strong className="font-medium text-foreground">automated</strong> messages only. It
          does not need its own website; DNS records from your email provider are enough.
        </p>
        {contactEmail ? (
          <p>
            For <strong className="font-medium text-foreground">human support</strong>, you can also email{" "}
            <a className="text-primary font-medium hover:underline break-all" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            .
          </p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Operators: set <code className="font-mono">VITE_CONTACT_EMAIL</code> at build time to show a support
            address here.
          </p>
        )}
        {user ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/feedback">In-app feedback &amp; screenshots</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );

  const inner = (
    <div className={embedded ? "p-6 space-y-6 max-w-3xl" : "w-full max-w-lg space-y-6"}>
      {!embedded && (
        <div className="text-center mb-2">
          <div className="inline-flex items-center gap-2 text-primary mb-2">
            <Mail className="h-8 w-8" />
            <span className="text-2xl font-bold">Contact &amp; email</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Reach the team, learn how system email works, or sign in for the full app.
          </p>
        </div>
      )}

      {embedded && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Mail className="h-7 w-7 text-primary shrink-0" />
            Contact &amp; email
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Message the team, system email notes, and optional direct support.
          </p>
        </div>
      )}

      {formCard}
      {explainerCard}

      <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
        {!user ? (
          <Button variant="default" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return inner;
  }

  return (
    <PretextShell
      chips={["Say hello", "Async", "Support"]}
      className="h-full min-h-dvh overflow-y-auto flex items-center justify-center px-4 py-8"
    >
      {inner}
    </PretextShell>
  );
}
