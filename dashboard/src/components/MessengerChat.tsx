import { useEffect, useRef, useState } from "react";

interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
}

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isMe: boolean;
}

const API = "http://localhost:3001/api/messenger";

export default function MessengerChat() {
  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/status`)
      .then((r) => r.json())
      .then((data) => {
        setStatus(data.status);
        setError(data.error);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    const fetchConvs = async () => {
      try {
        const res = await fetch(`${API}/conversations`);
        const data = await res.json();
        setConversations(data.conversations || []);
      } catch {}
      setLoadingConvs(false);
    };
    setLoadingConvs(true);
    fetchConvs();
    const interval = setInterval(fetchConvs, 10000);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (!selectedConv || status !== "connected") return;
    const fetchMsgs = async () => {
      try {
        const res = await fetch(
          `${API}/conversations/${selectedConv}/messages`
        );
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.conversationName) setSelectedName(data.conversationName);
      } catch {}
      setLoadingMsgs(false);
    };
    setLoadingMsgs(true);
    fetchMsgs();
    const interval = setInterval(fetchMsgs, 5000);
    return () => clearInterval(interval);
  }, [selectedConv, status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleConnect = async () => {
    setStatus("connecting");
    setError(null);
    try {
      const res = await fetch(`${API}/connect`, { method: "POST" });
      const data = await res.json();
      setStatus(data.status);
      if (data.error) setError(data.error);
    } catch (err: any) {
      setStatus("error");
      setError(err.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch(`${API}/disconnect`, { method: "POST" });
    } catch {}
    setStatus("disconnected");
    setConversations([]);
    setMessages([]);
    setSelectedConv(null);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      await fetch(`${API}/conversations/${selectedConv}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      setInputText("");
      const res = await fetch(
        `${API}/conversations/${selectedConv}/messages`
      );
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error("Send failed:", err);
    }
    setSending(false);
  };

  const statusColor =
    status === "connected"
      ? "#4ecdc4"
      : status === "connecting"
        ? "#f0c040"
        : status === "error"
          ? "#e74c3c"
          : "#666";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: "#12121e",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: statusColor,
            flexShrink: 0,
          }}
        />
        <span style={{ color: "#ccc", fontSize: 14, flex: 1 }}>
          {status === "connected"
            ? "Connected to Messenger"
            : status === "connecting"
              ? "Connecting to Messenger..."
              : status === "error"
                ? `Error: ${error}`
                : "Disconnected"}
        </span>
        {status === "connected" ? (
          <button
            onClick={handleDisconnect}
            style={{
              padding: "6px 16px",
              background: "#333",
              color: "#ccc",
              border: "1px solid #444",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={status === "connecting"}
            style={{
              padding: "6px 16px",
              background: status === "connecting" ? "#333" : "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: status === "connecting" ? "wait" : "pointer",
              fontSize: 13,
            }}
          >
            {status === "connecting" ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>

      {status !== "connected" && (
        <div style={{ color: "#666", textAlign: "center", marginTop: 60 }}>
          <p>Connect to your Marketplace inbox to view and respond to buyer messages.</p>
          <p style={{ fontSize: 12, marginTop: 8, color: "#555" }}>
            Launch Chrome with: <code style={{ background: "#1a1a2e", padding: "2px 6px", borderRadius: 4, color: "#4ecdc4" }}>
              chrome --remote-debugging-port=9222
            </code> then click Connect.
          </p>
        </div>
      )}

      {status === "connected" && (
        <div style={{ display: "flex", gap: 0, height: "calc(100vh - 240px)" }}>
          {/* Conversation List */}
          <div
            style={{
              width: 300,
              borderRight: "1px solid #2a2a3a",
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            {loadingConvs && conversations.length === 0 && (
              <p style={{ color: "#888", padding: 16, fontSize: 13 }}>
                Loading conversations...
              </p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  setSelectedConv(conv.id);
                  setSelectedName(conv.name);
                  setMessages([]);
                }}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  borderLeft:
                    selectedConv === conv.id
                      ? "3px solid #4f46e5"
                      : "3px solid transparent",
                  background:
                    selectedConv === conv.id ? "#1a1a2e" : "transparent",
                  transition: "all 0.1s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontWeight: conv.unread ? 700 : 400,
                      color: conv.unread ? "#e0e0e0" : "#aaa",
                      fontSize: 14,
                    }}
                  >
                    {conv.name}
                  </span>
                  <span style={{ color: "#666", fontSize: 11 }}>
                    {conv.timestamp}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {conv.unread && (
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#4f46e5",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      color: "#666",
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {conv.lastMessage}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Message Thread */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            {!selectedConv ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#666",
                }}
              >
                Select a conversation
              </div>
            ) : (
              <>
                {/* Header */}
                <div
                  style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid #2a2a3a",
                    fontWeight: 600,
                    fontSize: 16,
                    color: "#e0e0e0",
                  }}
                >
                  {selectedName}
                </div>

                {/* Messages */}
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {loadingMsgs && messages.length === 0 && (
                    <p style={{ color: "#888", fontSize: 13 }}>
                      Loading messages...
                    </p>
                  )}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: msg.isMe ? "flex-end" : "flex-start",
                        maxWidth: "70%",
                      }}
                    >
                      {!msg.isMe && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#888",
                            marginBottom: 2,
                            paddingLeft: 12,
                          }}
                        >
                          {msg.sender}
                        </div>
                      )}
                      <div
                        style={{
                          padding: "8px 14px",
                          borderRadius: 18,
                          background: msg.isMe ? "#4f46e5" : "#1a1a2e",
                          color: msg.isMe ? "#fff" : "#e0e0e0",
                          fontSize: 14,
                          lineHeight: 1.4,
                          wordBreak: "break-word",
                        }}
                      >
                        {msg.text}
                      </div>
                      {msg.timestamp && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "#555",
                            marginTop: 2,
                            textAlign: msg.isMe ? "right" : "left",
                            paddingLeft: msg.isMe ? 0 : 12,
                            paddingRight: msg.isMe ? 12 : 0,
                          }}
                        >
                          {msg.timestamp}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div
                  style={{
                    padding: "12px 20px",
                    borderTop: "1px solid #2a2a3a",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message..."
                    disabled={sending}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      background: "#12121e",
                      border: "1px solid #2a2a3a",
                      borderRadius: 20,
                      color: "#e0e0e0",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !inputText.trim()}
                    style={{
                      padding: "8px 20px",
                      background:
                        sending || !inputText.trim() ? "#333" : "#4f46e5",
                      color: "#fff",
                      border: "none",
                      borderRadius: 20,
                      cursor:
                        sending || !inputText.trim()
                          ? "not-allowed"
                          : "pointer",
                      fontSize: 14,
                    }}
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
