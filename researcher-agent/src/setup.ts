import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import * as fs from "fs";
import * as readline from "readline";

const BB_API_KEY = process.env.BROWSERBASE_API_KEY!;
const BB_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID!;

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

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

  const envPath = ".env";
  let envContent = fs.readFileSync(envPath, "utf-8");
  if (envContent.includes("BROWSERBASE_CONTEXT_ID")) {
    envContent = envContent.replace(
      /BROWSERBASE_CONTEXT_ID=.*/,
      `BROWSERBASE_CONTEXT_ID="${data.id}"`,
    );
  } else {
    envContent += `\nBROWSERBASE_CONTEXT_ID="${data.id}"\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("Saved context ID to .env");

  return data.id;
}

async function main() {
  const contextId = await getOrCreateContext();

  console.log("\n========================================");
  console.log("  STEP 1: Log into Facebook locally");
  console.log("========================================");
  console.log("  A Chrome window will open.");
  console.log("  Log into Facebook manually (with 2FA).");
  console.log("  Then come back here and press ENTER.\n");

  const localStagehand = new Stagehand({
    env: "LOCAL",
    verbose: 0,
    localBrowserLaunchOptions: { headless: false },
  });

  await localStagehand.init();
  const localPage = localStagehand.context.pages()[0];
  await localPage.goto("https://www.facebook.com/");

  await waitForEnter("Press ENTER after you've logged into Facebook... ");

  const cookies = await localStagehand.context.cookies();
  const fbCookies = cookies.filter(
    (c) => c.domain?.includes("facebook.com") || c.domain?.includes("messenger.com"),
  );
  console.log(`Captured ${fbCookies.length} Facebook cookies.`);

  let storage = { local: {} as Record<string, string>, session: {} as Record<string, string> };
  try {
    await localPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
    await localPage.waitForTimeout(3000);
    storage = await localPage.evaluate(() => {
      const dump = (s: Storage): Record<string, string> => {
        const o: Record<string, string> = {};
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k) try { o[k] = s.getItem(k) ?? ""; } catch {}
        }
        return o;
      };
      return { local: dump(localStorage), session: dump(sessionStorage) };
    });
  } catch (e) {
    console.log("Storage capture failed:", (e as Error).message);
  }
  console.log(`Captured ${Object.keys(storage.local).length} localStorage keys.`);

  await localStagehand.close();
  console.log("Local browser closed.\n");

  console.log("========================================");
  console.log("  STEP 2: Saving to Browserbase context");
  console.log("========================================\n");

  const bbStagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
    browserbaseSessionCreateParams: {
      browserSettings: {
        context: { id: contextId, persist: true },
      },
    },
  });

  await bbStagehand.init();
  await bbStagehand.context.addCookies(fbCookies);
  console.log("Cookies injected.");

  const bbPage = bbStagehand.context.pages()[0];
  try {
    await bbPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  } catch {}
  await bbPage.waitForTimeout(3000);

  await bbPage.evaluate((data: typeof storage) => {
    try {
      for (const [k, v] of Object.entries(data.local)) localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(data.session)) sessionStorage.setItem(k, v);
    } catch {}
  }, storage);
  console.log("Storage injected.");

  try {
    await bbPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  } catch {}
  await bbPage.waitForTimeout(8000);

  const pageState = await bbStagehand.extract(
    "Is this a login page or is the user logged in? Look for login form vs news feed.",
    z.object({ isLoginPage: z.boolean(), description: z.string() }),
  );

  await bbStagehand.close();

  if (pageState.isLoginPage) {
    console.log("\nFailed — Facebook required re-login from Browserbase IP.");
    console.log("Try running setup again.");
  } else {
    console.log(`\nSuccess! Facebook session saved to context: ${contextId}`);
    console.log("Run 'npm run dev' to research prices with FB Marketplace data.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
