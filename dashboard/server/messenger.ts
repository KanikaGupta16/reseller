import { exec } from "child_process";
import { chromium, type Browser, type Page } from "playwright-core";

const SESSION = "default";
let cdpBrowser: Browser | null = null;
let cdpPage: Page | null = null;

async function getCdpPage(): Promise<Page> {
  if (cdpPage) {
    try {
      await cdpPage.title();
      return cdpPage;
    } catch {
      cdpBrowser = null;
      cdpPage = null;
    }
  }

  cdpBrowser = await chromium.connectOverCDP("http://localhost:9222");
  const contexts = cdpBrowser.contexts();
  const pages = contexts.length > 0 ? contexts[0].pages() : [];
  const messengerPage = pages.find(p => p.url().includes("messenger.com")) || pages[0];
  if (!messengerPage) throw new Error("No Messenger page found in Chrome");
  cdpPage = messengerPage;
  console.log("[Messenger] Playwright connected via CDP");
  return cdpPage;
}

export interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  isMe: boolean;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function browse(args: string[], timeoutMs = 30000): Promise<string> {
  const escaped = args.map(a => {
    if (a.includes(" ") || a.includes('"') || a.includes("'") || a.includes("(") || a.includes(")")) {
      return `"${a.replace(/"/g, '\\"')}"`;
    }
    return a;
  });
  const cmd = `browse ${escaped.join(" ")}`;
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5, shell: "cmd.exe" }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`browse ${args[0]} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function parseSnapshot(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return parsed.tree || raw;
  } catch {
    return raw;
  }
}

class MessengerSession {
  private _status: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
  private _error: string | null = null;
  private currentConversationName: string | null = null;
  private operationLock: Promise<void> = Promise.resolve();
  private conversationNameMap: Map<string, string> = new Map();

  get status() { return this._status; }
  get error() { return this._error; }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const prev = this.operationLock;
    this.operationLock = new Promise((r) => { release = r; });
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  async connect(): Promise<void> {
    if (this._status === "connected") return;
    if (this._status === "connecting") return;

    this._status = "connecting";
    this._error = null;

    try {
      console.log("[Messenger] Auto-connecting to local Chrome...");
      await browse(["open", "https://www.messenger.com/marketplace/", "--cdp", "9222", "-s", SESSION, "--wait", "load", "--timeout", "60000"], 90000);

      await browse(["wait", "timeout", "3000", "-s", SESSION]);

      // Check page state from snapshot
      const raw = await browse(["snapshot", "--compact", "-s", SESSION], 15000);
      const tree = parseSnapshot(raw);

      if (tree.includes("Continue as")) {
        console.log("[Messenger] Clicking 'Continue as' button...");
        const refMatch = tree.match(/\[(\d+-\d+)\].*Continue as/);
        if (refMatch) {
          // Find the parent button/link ref
          const lines = tree.split("\n");
          for (const line of lines) {
            if (line.includes("Continue as") && (line.includes("button") || line.includes("link"))) {
              const rm = line.match(/\[(\d+-\d+)\]/);
              if (rm) {
                await browse(["click", `@${rm[1]}`, "-s", SESSION]);
                break;
              }
            }
          }
        }
        await browse(["wait", "timeout", "10000", "-s", SESSION]);
      } else if (tree.includes("Log in") && tree.includes("Password")) {
        throw new Error("Facebook login required. Please log in manually in the browser window, then click Connect again.");
      }

      this._status = "connected";
      this.currentConversationName = null;
      console.log("[Messenger] Connected to Marketplace inbox");
    } catch (err: any) {
      this._status = "error";
      this._error = err.message;
      throw err;
    }
  }

  async getConversations(): Promise<Conversation[]> {
    return this.withLock(async () => {
      this.ensureConnected();

      // Don't navigate away from current conversation — sidebar is always visible
      const raw = await browse(["snapshot", "--compact", "-s", SESSION], 20000);
      const tree = parseSnapshot(raw);

      const conversations: Conversation[] = [];
      const lines = tree.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match: [ref] row: Group chat: Name · Item ...
        const rowMatch = line.match(/\[\d+-\d+\] row:/);
        if (!rowMatch) continue;

        let name = "";
        let lastMessage = "";
        let timestamp = "";
        let hasReply = false;
        let linkRef = "";

        for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
          const child = lines[j];
          if (/\[\d+-\d+\] row:/.test(child)) break;

          // Capture the link ref for clicking later
          const linkMatch = child.match(/\[(\d+-\d+)\] link: Group chat: (.+)/);
          if (linkMatch) {
            linkRef = linkMatch[1];
          }

          const staticMatch = child.match(/StaticText: (.+)/);
          if (staticMatch) {
            const text = staticMatch[1].trim();
            if (!text) continue;
            if (!name) {
              name = text;
            } else if (text === "Reply?") {
              hasReply = true;
            } else if (!lastMessage && text !== name) {
              lastMessage = text;
            }
          }

          const abbrMatch = child.match(/Abbr: (.+)/);
          if (abbrMatch && !timestamp) {
            timestamp = abbrMatch[1].trim();
          }
        }

        if (name && name !== "Loading...") {
          const id = slugify(name);
          this.conversationNameMap.set(id, name);
          conversations.push({
            id,
            name,
            lastMessage: lastMessage || "",
            timestamp: timestamp || "",
            unread: hasReply,
          });
        }
      }

      console.log(`[Messenger] Found ${conversations.length} conversations`);
      return conversations;
    });
  }

  async getMessages(conversationId: string): Promise<{
    messages: Message[];
    conversationName: string;
  }> {
    return this.withLock(async () => {
      this.ensureConnected();

      // Check if we need to click into this conversation
      const snap = parseSnapshot(await browse(["snapshot", "--compact", "-s", SESSION], 20000));
      const originalName = this.conversationNameMap.get(conversationId) || conversationId;
      const alreadyOpen = snap.includes("textbox:") && snap.includes(originalName) &&
        this.currentConversationName === conversationId;

      if (!alreadyOpen) {
        console.log(`[Messenger] Opening conversation: "${originalName}"`);
        try {
          const page = await getCdpPage();
          const link = page.locator(`a[role="link"]`).filter({ hasText: originalName }).first();
          await link.click({ timeout: 5000 });
          await page.waitForTimeout(2000);
        } catch (err: any) {
          console.error(`[Messenger] Playwright click failed: ${err.message}, trying fallback`);
          try {
            const page = await getCdpPage();
            await page.locator(`[data-testid="mwthreadlist-item"]`).filter({ hasText: originalName }).first().click({ timeout: 5000 });
            await page.waitForTimeout(2000);
          } catch {
            console.error(`[Messenger] Fallback click also failed`);
          }
        }
        this.currentConversationName = conversationId;
      }

      const raw = await browse(["snapshot", "--compact", "-s", SESSION], 20000);
      const tree = parseSnapshot(raw);
      const lines = tree.split("\n");

      const messages: Message[] = [];
      let conversationName = this.conversationNameMap.get(conversationId) || conversationId;

      // Get conversation name from heading like "Conversation titled Name · Item"
      for (const line of lines) {
        const headingMatch = line.match(/heading: (?:Conversation titled )?(.+)/);
        if (headingMatch && headingMatch[1].includes("·")) {
          conversationName = headingMatch[1].trim();
          break;
        }
      }

      // Parse article elements - each is a message
      // Structure: [ref] article
      //   [ref] StaticText: message text
      //   [ref] button: Enter, Message sent HH:MM by Sender: text
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/\[\d+-\d+\] article/.test(line)) continue;

        let messageText = "";
        let sender = "";
        let timestamp = "";
        let isMe = false;

        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          const child = lines[j];
          if (/\[\d+-\d+\] article/.test(child)) break;

          // Get message text from StaticText (skip "Enter," and metadata text)
          const staticMatch = child.match(/StaticText: (.+)/);
          if (staticMatch) {
            const text = staticMatch[1].trim();
            if (text && text !== "Enter," && !text.startsWith("Message sent") && text !== "You" && !messageText) {
              messageText = text;
            }
          }

          // Parse "Message sent HH:MM by Sender: text" from button or span
          const msgMatch = child.match(/Message sent (\d+:\d+) by (.+?):/);
          if (msgMatch) {
            timestamp = msgMatch[1];
            sender = msgMatch[2].trim();
            if (sender === "You") isMe = true;
          }

          // Also check div pattern: "At HH:MM, You: text"
          const divMatch = child.match(/div: At (\d+:\d+), (.+?):/);
          if (divMatch) {
            timestamp = divMatch[1];
            sender = divMatch[2].trim();
            if (sender === "You") isMe = true;
          }
        }

        if (messageText) {
          messages.push({
            id: String(messages.length),
            sender: sender || conversationName.split("·")[0].trim(),
            text: messageText,
            timestamp,
            isMe,
          });
        }
      }

      console.log(`[Messenger] Found ${messages.length} messages in "${conversationName}"`);
      return { messages, conversationName };
    });
  }

  async sendMessage(conversationId: string, text: string): Promise<void> {
    return this.withLock(async () => {
      this.ensureConnected();

      if (this.currentConversationName !== conversationId) {
        const originalName = this.conversationNameMap.get(conversationId) || conversationId;
        try {
          const page = await getCdpPage();
          await page.locator(`a[role="link"]`).filter({ hasText: originalName }).first().click({ timeout: 5000 });
          await page.waitForTimeout(2000);
        } catch (err: any) {
          console.error(`[Messenger] Playwright click failed in sendMessage: ${err.message}`);
        }
        this.currentConversationName = conversationId;
      }

      // Find and click the textbox
      const snap = parseSnapshot(await browse(["snapshot", "--compact", "-s", SESSION], 15000));
      let textboxRef: string | null = null;
      for (const line of snap.split("\n")) {
        if (line.includes("textbox:")) {
          const rm = line.match(/\[(\d+-\d+)\]/);
          if (rm) { textboxRef = rm[1]; break; }
        }
      }

      if (textboxRef) {
        await browse(["click", `@${textboxRef}`, "-s", SESSION]);
      } else {
        await browse(["click", '[role="textbox"]', "-s", SESSION]);
      }

      await browse(["type", text, "-s", SESSION]);
      await browse(["key", "Enter", "-s", SESSION]);
      await browse(["wait", "timeout", "2000", "-s", SESSION]);

      console.log(`[Messenger] Sent message to ${conversationId}: "${text.slice(0, 50)}..."`);
    });
  }

  async disconnect(): Promise<void> {
    try {
      await browse(["stop", "-s", SESSION]);
    } catch {}
    if (cdpBrowser) {
      try { await cdpBrowser.close(); } catch {}
      cdpBrowser = null;
      cdpPage = null;
    }
    this._status = "disconnected";
    this._error = null;
    this.currentConversationName = null;
    console.log("[Messenger] Disconnected");
  }

  private findConversationRef(snapshot: string, conversationId: string): string | null {
    const originalName = this.conversationNameMap.get(conversationId);
    const slugParts = conversationId.split("-");

    console.log(`[Messenger] findConversationRef: id="${conversationId}", originalName="${originalName}", slugParts=${JSON.stringify(slugParts)}`);

    const linkLines = snapshot.split("\n").filter(l => l.includes("link:"));
    console.log(`[Messenger] Found ${linkLines.length} link lines, Group chat links: ${linkLines.filter(l => l.includes("Group chat")).length}`);

    for (const line of snapshot.split("\n")) {
      if (!line.includes("link: Group chat:")) continue;

      if (originalName && line.includes(originalName)) {
        const rm = line.match(/\[(\d+-\d+)\]/);
        if (rm) {
          console.log(`[Messenger] Exact match found: ref=${rm[1]}`);
          return rm[1];
        }
      }

      const lower = line.toLowerCase();
      if (slugParts.every(part => lower.includes(part))) {
        const rm = line.match(/\[(\d+-\d+)\]/);
        if (rm) {
          console.log(`[Messenger] Slug match found: ref=${rm[1]}`);
          return rm[1];
        }
      }
    }

    console.log(`[Messenger] No match found for "${conversationId}"`);
    return null;
  }

  private ensureConnected(): void {
    if (this._status !== "connected") {
      throw new Error("Messenger session not connected");
    }
  }
}

export const messengerSession = new MessengerSession();
