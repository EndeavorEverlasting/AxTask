import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MessageSquare, Send, Search, Users, Plus, ChevronLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DirectMessage } from "@shared/schema";

interface ConversationPreview {
  id: string;
  otherUser: { id: string; displayName: string | null; profileImageUrl: string | null };
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  createdAt: string | null;
}

interface UserSearchResult {
  id: string;
  displayName: string | null;
  profileImageUrl: string | null;
  followerCount: number;
}

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function formatTimestamp(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function UserAvatar({ displayName, profileImageUrl, size = "md" }: { displayName: string | null; profileImageUrl: string | null; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-10 w-10" : size === "md" ? "h-8 w-8" : "h-6 w-6";
  const iconSize = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3 w-3";
  return profileImageUrl ? (
    <img src={profileImageUrl} alt="" className={`${sizeClass} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${sizeClass} rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0`}>
      <Users className={`${iconSize} text-gray-500 dark:text-gray-400`} />
    </div>
  );
}

function NewConversationDialog({ open, onOpenChange, onConversationStarted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationStarted: (convId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const { data: rawResults, isLoading } = useQuery<UserSearchResult[]>({
    queryKey: ["/api/users/search", query],
    queryFn: () => query.trim().length >= 2
      ? fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`).then(r => r.ok ? r.json() : [])
      : Promise.resolve([]),
    enabled: query.trim().length >= 2,
  });
  const results: UserSearchResult[] = Array.isArray(rawResults) ? rawResults : [];

  const startMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("POST", "/api/messages/conversations", { userId }),
    onSuccess: (data: unknown) => {
      const typed = data as { conversationId: string };
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      onOpenChange(false);
      setQuery("");
      onConversationStarted(typed.conversationId);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start conversation", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setQuery(""); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
          {!isLoading && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">No users found</p>
          )}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {results.map(user => (
              <button
                key={user.id}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                onClick={() => startMutation.mutate(user.id)}
                disabled={startMutation.isPending}
              >
                <UserAvatar displayName={user.displayName} profileImageUrl={user.profileImageUrl} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user.displayName || "Anonymous"}
                  </p>
                  <p className="text-xs text-gray-500">{user.followerCount} followers</p>
                </div>
                {startMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConversationList({ conversations, selectedId, onSelect, currentUserId }: {
  conversations: ConversationPreview[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string;
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
        <MessageSquare className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No conversations yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start one with the + button above</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {conversations.map(conv => {
        const isSelected = conv.id === selectedId;
        const preview = conv.lastMessage
          ? (conv.lastMessage.senderId === currentUserId ? "You: " : "") + conv.lastMessage.body
          : "No messages yet";

        return (
          <button
            key={conv.id}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
              isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <div className="relative shrink-0">
              <UserAvatar displayName={conv.otherUser.displayName} profileImageUrl={conv.otherUser.profileImageUrl} size="md" />
              {conv.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[1rem] flex items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white px-0.5">
                  {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className={`text-sm truncate ${conv.unreadCount > 0 ? "font-semibold text-gray-900 dark:text-gray-100" : "font-medium text-gray-800 dark:text-gray-200"}`}>
                  {conv.otherUser.displayName || "Anonymous"}
                </span>
                {conv.lastMessage && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                    {timeAgo(conv.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? "text-gray-700 dark:text-gray-300" : "text-gray-400 dark:text-gray-500"}`}>
                {preview.length > 60 ? preview.slice(0, 60) + "…" : preview}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MessageThread({ conversationId, currentUserId, otherUser }: {
  conversationId: string;
  currentUserId: string;
  otherUser: { id: string; displayName: string | null; profileImageUrl: string | null } | null;
}) {
  const [messageText, setMessageText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<DirectMessage[]>({
    queryKey: ["/api/messages/conversations", conversationId],
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => apiRequest("POST", `/api/messages/conversations/${conversationId}`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      setMessageText("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  // Mark as read whenever conversation is opened/messages change
  useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/messages/conversations/${conversationId}/read`, {}),
  });

  useEffect(() => {
    if (conversationId) {
      apiRequest("PATCH", `/api/messages/conversations/${conversationId}/read`, {}).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      }).catch(() => {});
    }
  }, [conversationId, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!messageText.trim() || sendMutation.isPending) return;
    sendMutation.mutate(messageText.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: DirectMessage[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const dateStr = new Date(msg.createdAt!).toDateString();
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groupedMessages.push({ date: dateStr, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  const formatDateHeader = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-full">
      {otherUser && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
          <UserAvatar displayName={otherUser.displayName} profileImageUrl={otherUser.profileImageUrl} size="md" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {otherUser.displayName || "Anonymous"}
            </p>
            <p className="text-xs text-gray-400">Direct message</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageSquare className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">Say hello!</p>
          </div>
        )}
        {groupedMessages.map(group => (
          <div key={group.date}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0">{formatDateHeader(group.date)}</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="space-y-1.5">
              {group.messages.map(msg => {
                const isMe = msg.senderId === currentUserId;
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${
                      isMe
                        ? "bg-blue-500 text-white rounded-br-md"
                        : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md"
                    }`}>
                      <p className="break-words leading-relaxed">{msg.body}</p>
                      <p className={`text-[10px] mt-1 ${isMe ? "text-blue-200" : "text-gray-400 dark:text-gray-500"}`}>
                        {formatTimestamp(msg.createdAt!)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <div className="flex items-end gap-2">
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            className="resize-none min-h-[44px] max-h-32 text-sm"
            rows={1}
            maxLength={5000}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={!messageText.trim() || sendMutation.isPending}
            onClick={handleSend}
          >
            {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [newConvDialogOpen, setNewConvDialogOpen] = useState(false);

  const { data: conversations = [], isLoading: convsLoading } = useQuery<ConversationPreview[]>({
    queryKey: ["/api/messages/conversations"],
    refetchInterval: 30000,
  });

  const selectedConv = conversations.find(c => c.id === selectedConvId) || null;

  const showList = !isMobile || !selectedConvId;
  const showThread = !isMobile || !!selectedConvId;

  if (!user) return null;

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {showList && (
        <div className={`${isMobile ? "w-full" : "w-80 shrink-0"} flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Messages
            </h1>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setNewConvDialogOpen(true)}
              title="New conversation"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <ConversationList
                conversations={conversations}
                selectedId={selectedConvId}
                onSelect={(id) => setSelectedConvId(id)}
                currentUserId={user.id}
              />
            )}
          </div>
        </div>
      )}

      {showThread && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedConvId ? (
            <>
              {isMobile && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedConvId(null)}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                </div>
              )}
              <MessageThread
                conversationId={selectedConvId}
                currentUserId={user.id}
                otherUser={selectedConv?.otherUser ?? null}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <MessageSquare className="h-14 w-14 text-gray-200 dark:text-gray-700 mb-4" />
              <p className="text-base font-medium text-gray-500 dark:text-gray-400">Select a conversation</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">or start a new one</p>
              <Button className="mt-4 gap-2" onClick={() => setNewConvDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                New Message
              </Button>
            </div>
          )}
        </div>
      )}

      <NewConversationDialog
        open={newConvDialogOpen}
        onOpenChange={setNewConvDialogOpen}
        onConversationStarted={(convId) => setSelectedConvId(convId)}
      />
    </div>
  );
}
