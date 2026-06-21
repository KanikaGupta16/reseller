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

interface AgentLog {
  conversationId: string;
  question: string;
  reply: string;
  timestamp: number;
}

const BE = import.meta.env.VITE_API_URL || "";
const API = `${BE}/api/messenger`;
const AGENT_API = `${BE}/api/buyer-agent`;

export default function MessengerChat() {
  if (!BE) return (
    <div className="empty" style={{ minHeight: 400 }}>
      <span className="empty-icon">💬</span>
      <span style={{ fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.02em" }}>Backend not connected</span>
      <span style={{ color: "var(--muted)", maxWidth: 360, textAlign: "center", lineHeight: 1.6 }}>
        Messenger requires the agent backend running locally.<br />
        Run <code style={{ background: "var(--gray)", padding: "2px 6px", borderRadius: 4, fontSize: "0.8rem" }}>npm run server</code> inside <code style={{ background: "var(--gray)", padding: "2px 6px", borderRadius: 4, fontSize: "0.8rem" }}>dashboard/</code> and set <code style={{ background: "var(--gray)", padding: "2px 6px", borderRadius: 4, fontSize: "0.8rem" }}>VITE_API_URL</code>.
      </span>
    </div>
  );

  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentLog, setAgentLog] = useState<AgentLog[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/status`)
      .then((r) => r.json())
      .then((data) => { setStatus(data.status); setError(data.error); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchAgentStatus = async () => {
      try {
        const res = await fetch(`${AGENT_API}/status`);
        const data = await res.json();
        setAgentRunning(data.running);
        setAgentLog(data.log || []);
      } catch {}
    };
    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 10000);
    return () => clearInterval(interval);
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
        const res = await fetch(`${API}/conversations/${selectedConv}/messages`);
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
    setStatus("connecting"); setError(null);
    try {
      const res = await fetch(`${API}/connect`, { method: "POST" });
      const data = await res.json();
      setStatus(data.status);
      if (data.error) setError(data.error);
    } catch (err: any) {
      setStatus("error"); setError(err.message);
    }
  };

  const handleDisconnect = async () => {
    try { await fetch(`${API}/disconnect`, { method: "POST" }); } catch {}
    setStatus("disconnected"); setConversations([]); setMessages([]); setSelectedConv(null);
  };

  const handleAgentToggle = async () => {
    try {
      const endpoint = agentRunning ? "stop" : "start";
      const res = await fetch(`${AGENT_API}/${endpoint}`, { method: "POST" });
      const data = await res.json();
      setAgentRunning(data.running);
    } catch (err: any) {
      console.error("Agent toggle failed:", err);
    }
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
      const res = await fetch(`${API}/conversations/${selectedConv}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error("Send failed:", err);
    }
    setSending(false);
  };

  const statusColor = status === "connected" ? "#16a34a" : status === "connecting" ? "#ca8a04" : status === "error" ? "#ef4444" : "#888";

  return (
    <div>
      {/* Connection bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        background: "#F8F8F8", borderRadius: 10, marginBottom: 16, border: "1.5px solid rgba(0,0,0,0.08)",
      }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
        <span style={{ color: "#333", fontSize: 14, flex: 1 }}>
          {status === "connected" ? "Connected to Messenger" : status === "connecting" ? "Connecting to Messenger..." : status === "error" ? `Error: ${error}` : "Disconnected"}
        </span>
        {status === "connected" ? (
          <button onClick={handleDisconnect} className="btn btn-secondary" style={{ fontSize: 13 }}>Disconnect</button>
        ) : (
          <button onClick={handleConnect} disabled={status === "connecting"} className="btn btn-primary" style={{ fontSize: 13 }}>
            {status === "connecting" ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>

      {/* Buyer Agent Bar */}
      {status === "connected" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
          background: agentRunning ? "#f0fdf4" : "#F8F8F8",
          borderRadius: 10, marginBottom: 16,
          border: agentRunning ? "1.5px solid #bbf7d0" : "1.5px solid rgba(0,0,0,0.08)",
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: agentRunning ? "#22c55e" : "#ccc",
            boxShadow: agentRunning ? "0 0 6px #22c55e" : "none",
            flexShrink: 0,
          }} />
          <span style={{ color: "#333", fontSize: 13, flex: 1 }}>
            <strong>Buyer Reply Agent</strong>
            <span style={{ color: "#888", marginLeft: 8 }}>
              {agentRunning ? `Auto-replying to questions (${agentLog.length} replies sent)` : "Off"}
            </span>
          </span>
          <button onClick={handleAgentToggle} className={`btn ${agentRunning ? "btn-danger" : "btn-success"}`} style={{ fontSize: 12 }}>
            {agentRunning ? "Stop Agent" : "Start Agent"}
          </button>
        </div>
      )}

      {status !== "connected" && (
        <div style={{ color: "#888", textAlign: "center", marginTop: 60 }}>
          <p>Connect to your Marketplace inbox to view and respond to buyer messages.</p>
          <p style={{ fontSize: 12, marginTop: 8, color: "#aaa" }}>
            Launch Chrome with: <code style={{ background: "#F8F8F8", padding: "2px 6px", borderRadius: 4, color: "#E875BB", border: "1px solid rgba(0,0,0,0.08)" }}>
              chrome --remote-debugging-port=9222
            </code> then click Connect.
          </p>
        </div>
      )}

      {status === "connected" && (
        <div style={{ display: "flex", gap: 0, height: "calc(100vh - 280px)", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden" }}>
          {/* Conversation List */}
          <div style={{ width: 300, borderRight: "1.5px solid rgba(0,0,0,0.08)", overflowY: "auto", flexShrink: 0 }}>
            {loadingConvs && conversations.length === 0 && (
              <p style={{ color: "#888", padding: 16, fontSize: 13 }}>Loading conversations...</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => { setSelectedConv(conv.id); setSelectedName(conv.name); setMessages([]); }}
                style={{
                  padding: "12px 16px", cursor: "pointer",
                  borderLeft: selectedConv === conv.id ? "3px solid #080808" : "3px solid transparent",
                  background: selectedConv === conv.id ? "#F8F8F8" : "transparent",
                  transition: "all 0.1s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: conv.unread ? 800 : 400, color: conv.unread ? "#080808" : "#555", fontSize: 14 }}>
                    {conv.name}
                  </span>
                  <span style={{ color: "#aaa", fontSize: 11 }}>{conv.timestamp}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {conv.unread && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E875BB", flexShrink: 0 }} />}
                  <span style={{ color: "#888", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conv.lastMessage}
                  </span>
                </div>
              </div>
            ))}

            {agentRunning && agentLog.length > 0 && (
              <div style={{ borderTop: "1.5px solid rgba(0,0,0,0.08)", padding: "12px 16px" }}>
                <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                  Agent Activity
                </div>
                {agentLog.slice(-5).reverse().map((entry, i) => (
                  <div key={i} style={{ marginBottom: 8, fontSize: 12 }}>
                    <div style={{ color: "#888" }}>Q: <span style={{ color: "#555" }}>{entry.question}</span></div>
                    <div style={{ color: "#16a34a" }}>A: {entry.reply}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message Thread */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {!selectedConv ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
                Select a conversation
              </div>
            ) : (
              <>
                <div style={{ padding: "12px 20px", borderBottom: "1.5px solid rgba(0,0,0,0.08)", fontWeight: 800, fontSize: 16, color: "#080808" }}>
                  {selectedName}
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {loadingMsgs && messages.length === 0 && <p style={{ color: "#888", fontSize: 13 }}>Loading messages...</p>}
                  {messages.map((msg) => (
                    <div key={msg.id} style={{ alignSelf: msg.isMe ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                      {!msg.isMe && <div style={{ fontSize: 11, color: "#888", marginBottom: 2, paddingLeft: 12 }}>{msg.sender}</div>}
                      <div style={{
                        padding: "8px 14px", borderRadius: 18,
                        background: msg.isMe ? "#080808" : "#F8F8F8",
                        color: msg.isMe ? "#fff" : "#080808",
                        fontSize: 14, lineHeight: 1.4, wordBreak: "break-word",
                      }}>
                        {msg.text}
                      </div>
                      {msg.timestamp && (
                        <div style={{
                          fontSize: 10, color: "#aaa", marginTop: 2,
                          textAlign: msg.isMe ? "right" : "left",
                          paddingLeft: msg.isMe ? 0 : 12, paddingRight: msg.isMe ? 12 : 0,
                        }}>
                          {msg.timestamp}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div style={{ padding: "12px 20px", borderTop: "1.5px solid rgba(0,0,0,0.08)", display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Type a message..."
                    disabled={sending}
                    style={{
                      flex: 1, padding: "10px 16px", background: "#F8F8F8",
                      border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 100,
                      color: "#080808", fontSize: 14, outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !inputText.trim()}
                    className="btn btn-primary"
                    style={{ borderRadius: 100, padding: "8px 20px", fontSize: 14 }}
                  >
                    {sending ? "..." : "Send"}
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
