import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import * as fs from "fs";
import * as readline from "readline";

const BB_API_KEY = process.env.BROWSERBASE_API_KEY!;
const BB_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID!;

async function getOrCreateContext(): Promise<string> {
  const envContextId = process.env.BROWSERBASE_CONTEXT_ID;
  if (envContextId) {
    console.log(`Using existing context: ${envContextId}`);
    return envContextId;
  }

  console.log("Creating new persistent Browserbase context...");
  const res = await fetch("https://api.browserbase.com/v1/contexts", {
    method: "POST",
    headers: {
      "x-bb-api-key": BB_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId: BB_PROJECT_ID }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create context: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string };
  console.log(`Created context: ${data.id}`);

  const envContent = fs.readFileSync(".env", "utf-8");
  const updated = envContent.replace(
    'BROWSERBASE_CONTEXT_ID=""',
    `BROWSERBASE_CONTEXT_ID="${data.id}"`,
  );
  fs.writeFileSync(".env", updated);
  console.log("Auto-saved context ID to .env");

  return data.id;
}

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const contextId = await getOrCreateContext();

  console.log("\n========================================");
  console.log("  STEP 1: Local browser login");
  console.log("========================================");
  console.log("  Opening a local Chrome window...");
  console.log("  Log into Facebook manually (2FA, etc.)");
  console.log("  Then come back here and press ENTER.\n");

  const localStagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    localBrowserLaunchOptions: {
      headless: false,
    },
  });

  await localStagehand.init();
  const localPage = localStagehand.context.pages()[0];
  await localPage.goto("https://www.facebook.com/");

  await waitForEnter("Press ENTER after you've logged into Facebook... ");

  // Grab cookies from the local browser
  const cookies = await localStagehand.context.cookies();
  const fbCookies = cookies.filter((c) => c.domain?.includes("facebook.com") || c.domain?.includes("messenger.com"));
  console.log(`Captured ${fbCookies.length} Facebook cookies.`);

  // Capture localStorage / sessionStorage for the facebook.com origin. Cookies
  // alone aren't enough — Facebook/Messenger keeps session/app tokens here, and
  // without them the thread list never populates (stays on skeleton loaders).
  await localPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  await localPage.waitForTimeout(3000);

  let storage: { local: Record<string, string>; session: Record<string, string> } = {
    local: {},
    session: {},
  };
  try {
    storage = await localPage.evaluate(() => {
      const dump = (s: Storage): Record<string, string> => {
        const o: Record<string, string> = {};
        try {
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k) {
              try {
                o[k] = s.getItem(k) ?? "";
              } catch {
                /* skip unreadable key */
              }
            }
          }
        } catch {
          /* storage access denied — return what we have */
        }
        return o;
      };
      let local: Record<string, string> = {};
      let session: Record<string, string> = {};
      try {
        local = dump(localStorage);
      } catch {
        /* localStorage blocked */
      }
      try {
        session = dump(sessionStorage);
      } catch {
        /* sessionStorage blocked */
      }
      return { local, session };
    });
  } catch (e) {
    console.log("Storage capture failed, continuing with cookies only:", (e as Error).message);
  }
  console.log(
    `Captured ${Object.keys(storage.local).length} localStorage + ${Object.keys(storage.session).length} sessionStorage keys.`,
  );

  // Best-effort IndexedDB dump (E2EE device keys live here; CryptoKey objects
  // are non-serializable so those stores will be skipped — that's expected).
  let idbDump: Record<string, Record<string, unknown[]>> = {};
  try {
    idbDump = await localPage.evaluate(async () => {
    const result: Record<string, Record<string, unknown[]>> = {};
    try {
      const anyIDB = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
      if (!anyIDB.databases) return { unsupported: true } as unknown as typeof result;
      const dbs = await anyIDB.databases();
      for (const meta of dbs) {
        const name = meta.name;
        if (!name) continue;
        try {
          const db: IDBDatabase = await new Promise((resolve, reject) => {
            const req = indexedDB.open(name);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          result[name] = {};
          for (const storeName of Array.from(db.objectStoreNames)) {
            try {
              const tx = db.transaction(storeName, "readonly");
              const store = tx.objectStore(storeName);
              const rows: unknown[] = await new Promise((resolve, reject) => {
                const r = store.getAll();
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
              });
              // Drop anything that can't survive structured JSON round-trip.
              JSON.stringify(rows);
              result[name][storeName] = rows;
            } catch {
              // non-serializable store (e.g. CryptoKeys) — skip
            }
          }
          db.close();
        } catch {
          // db couldn't be opened — skip
        }
      }
    } catch {
      // indexedDB enumeration not available — skip
    }
    return result;
    });
  } catch (e) {
    console.log("IndexedDB capture failed, continuing without it:", (e as Error).message);
  }
  const idbDbCount = Object.keys(idbDump).filter((k) => k !== "unsupported").length;
  console.log(`Captured IndexedDB data from ${idbDbCount} database(s) (non-serializable stores skipped).`);

  await localStagehand.close();
  console.log("Local browser closed.\n");

  // Step 2: Transfer cookies to Browserbase persistent context
  console.log("========================================");
  console.log("  STEP 2: Saving cookies to Browserbase");
  console.log("========================================\n");

  const bbStagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
    browserbaseSessionCreateParams: {
      browserSettings: {
        context: {
          id: contextId,
          persist: true,
        },
      },
    },
  });

  await bbStagehand.init();

  // Inject the cookies into the Browserbase context
  await bbStagehand.context.addCookies(fbCookies);
  console.log("Cookies injected into Browserbase context.");

  // Land on the facebook.com origin first so we can write its storage.
  const bbPage = bbStagehand.context.pages()[0];
  try {
    await bbPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  } catch {}
  await bbPage.waitForTimeout(3000);

  // Inject localStorage + sessionStorage captured from the local login.
  await bbPage.evaluate((data: { local: Record<string, string>; session: Record<string, string> }) => {
    try {
      for (const [k, v] of Object.entries(data.local)) localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(data.session)) sessionStorage.setItem(k, v);
    } catch {
      // storage may be partitioned/unavailable — ignore
    }
  }, storage);
  console.log("localStorage + sessionStorage injected.");

  // Best-effort IndexedDB restore (serializable stores only).
  await bbPage.evaluate(async (dump: Record<string, Record<string, unknown[]>>) => {
    for (const [dbName, stores] of Object.entries(dump)) {
      if (dbName === "unsupported") continue;
      try {
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        for (const [storeName, rows] of Object.entries(stores)) {
          if (!db.objectStoreNames.contains(storeName)) continue;
          try {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            for (const row of rows) {
              try {
                store.put(row);
              } catch {
                // keyPath/out-of-line key mismatch — skip row
              }
            }
          } catch {
            // store not writable — skip
          }
        }
        db.close();
      } catch {
        // db not present in fresh context — skip
      }
    }
  }, idbDump);
  console.log("IndexedDB restore attempted.");

  // Reload so the app boots with the injected storage in place.
  try {
    await bbPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  } catch {}
  await bbPage.waitForTimeout(8000);

  const pageState = await bbStagehand.extract(
    "Is this a login page or is the user logged in? Look for login form vs news feed.",
    z.object({ isLoginPage: z.boolean(), description: z.string() }),
  );

  // The real success criterion is whether the authenticated Facebook home feed
  // actually rendered (vs. a login wall or empty shell). Poll observe() to confirm.
  let feedCount = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const feed = await bbStagehand.observe(
      "find the logged-in Facebook UI elements: the top navigation bar, the Messenger/chat icon, or news feed posts",
    );
    feedCount = feed.length;
    if (feedCount > 0) break;
    await bbPage.waitForTimeout(5000);
  }

  await bbStagehand.close();

  if (pageState.isLoginPage) {
    console.log("\nCookies didn't carry over — Facebook required re-login from this IP.");
    console.log("Re-run 'npm run setup' and complete any checkpoint in the local browser.");
  } else if (feedCount === 0) {
    console.log("\n⚠️ Logged in, but the Facebook UI did NOT render in Browserbase.");
    console.log("The session shell loaded but content stayed empty. This usually means the");
    console.log("transferred storage was insufficient (E2EE device keys are device-bound and");
    console.log("can't be ported) or the datacenter/proxy IP is distrusted by Meta.");
    console.log("Run 'npm start' to retry, but it may still show skeleton loaders.");
  } else {
    console.log(`\n✅ Success! Facebook is authenticated and the UI rendered (${feedCount} elements).`);
    console.log(`Context ID: ${contextId}`);
    console.log("Run 'npm start' to navigate Facebook → Messenger → Marketplace and reply.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
