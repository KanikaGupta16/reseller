'use client'
import { useEffect, useRef, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Conversation { id: string; name: string; lastMessage: string; timestamp: string; unread: boolean }
interface Message { id: string; sender: string; text: string; timestamp: string; isMe: boolean }

export default function MessengerTab() {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [convos, setConvos] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [convoName, setConvoName] = useState('')
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${API}/api/messenger/status`).then(r => r.json()).then(d => setStatus(d.status)).catch(() => {})
  }, [])

  useEffect(() => {
    if (status !== 'connected') return
    const loadConvos = () => fetch(`${API}/api/messenger/conversations`).then(r => r.json()).then(d => setConvos(d.conversations || [])).catch(() => {})
    loadConvos()
    const id = setInterval(loadConvos, 10000)
    return () => clearInterval(id)
  }, [status])

  useEffect(() => {
    if (!selected) return
    const loadMsgs = () => fetch(`${API}/api/messenger/conversations/${selected}/messages`).then(r => r.json()).then(d => { setMessages(d.messages || []); setConvoName(d.conversationName || '') }).catch(() => {})
    loadMsgs()
    const id = setInterval(loadMsgs, 5000)
    return () => clearInterval(id)
  }, [selected])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const connect = async () => {
    setStatus('connecting')
    try { await fetch(`${API}/api/messenger/connect`, { method: 'POST' }); setStatus('connected') }
    catch { setStatus('error') }
  }

  const disconnect = async () => {
    await fetch(`${API}/api/messenger/disconnect`, { method: 'POST' }).catch(() => {})
    setStatus('disconnected'); setConvos([]); setSelected(null); setMessages([])
  }

  const send = async () => {
    if (!text.trim() || !selected) return
    const t = text; setText('')
    await fetch(`${API}/api/messenger/conversations/${selected}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) }).catch(() => {})
    setMessages(m => [...m, { id: Date.now().toString(), sender: 'Me', text: t, timestamp: new Date().toLocaleTimeString(), isMe: true }])
  }

  const statusColor = { connected: 'var(--pink-2)', connecting: 'var(--yellow)', error: '#f87171', disconnected: '#888' }[status]

  return (
    <div className="db-section" style={{ padding: 0, height: '100%' }}>
      {/* Status bar */}
      <div className="db-messenger-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{status}</span>
        </div>
        <button className="db-pill db-pill--sm" onClick={status === 'connected' ? disconnect : connect} disabled={status === 'connecting'}>
          {status === 'connected' ? 'Disconnect' : status === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      </div>

      {status !== 'connected' ? (
        <div style={{ padding: '2rem' }}>
          <p className="db-empty">Connect to Messenger to view buyer conversations.</p>
          {status === 'error' && <p className="db-error" style={{ marginTop: '0.5rem' }}>Connection failed — make sure the backend is running and you&apos;re logged into Facebook.</p>}
        </div>
      ) : (
        <div className="db-messenger-layout">
          {/* Sidebar */}
          <div className="db-messenger-sidebar">
            {convos.length === 0 && <p className="db-empty" style={{ padding: '1rem' }}>No conversations</p>}
            {convos.map(c => (
              <div key={c.id} className={`db-convo ${selected === c.id ? 'db-convo--active' : ''} ${c.unread ? 'db-convo--unread' : ''}`} onClick={() => setSelected(c.id)}>
                <div className="db-convo-name">{c.name}</div>
                <div className="db-convo-preview">{c.lastMessage}</div>
                <div className="db-convo-time">{c.timestamp}</div>
                {c.unread && <div className="db-unread-dot" />}
              </div>
            ))}
          </div>

          {/* Messages */}
          <div className="db-messenger-main">
            {!selected ? (
              <p className="db-empty" style={{ padding: '2rem' }}>Select a conversation</p>
            ) : (
              <>
                <div className="db-messenger-header">{convoName}</div>
                <div className="db-messages">
                  {messages.map(m => (
                    <div key={m.id} className={`db-message ${m.isMe ? 'db-message--me' : 'db-message--them'}`}>
                      {!m.isMe && <div className="db-message-sender">{m.sender}</div>}
                      <div className={`db-bubble ${m.isMe ? 'db-bubble--me' : 'db-bubble--them'}`}>{m.text}</div>
                      <div className="db-message-time">{m.timestamp}</div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <div className="db-messenger-input">
                  <input className="db-input" value={text} onChange={e => setText(e.target.value)} placeholder="Type a message..." onKeyDown={e => e.key === 'Enter' && send()} />
                  <button className="db-pill db-pill--sm" onClick={send}>Send</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
