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
  await localPage.goto("https://www.facebook.com/login");

  await waitForEnter("Press ENTER after you've logged into Facebook... ");

  // Grab cookies from the local browser
  const cookies = await localStagehand.context.cookies();
  const fbCookies = cookies.filter((c) => c.domain?.includes("facebook.com"));
  console.log(`Captured ${fbCookies.length} Facebook cookies.`);

  // Capture localStorage / sessionStorage for the facebook.com origin so the
  // app boots fully authenticated rather than stopping at a checkpoint.
  await localPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  await localPage.waitForTimeout(3000);

  const storage = await localPage
    .evaluate(() => {
      // Accessing localStorage/sessionStorage can throw a SecurityError in some
      // partitioned contexts — guard each one so a failure just yields {}.
      const dump = (getStore: () => Storage): Record<string, string> => {
        const o: Record<string, string> = {};
        try {
          const s = getStore();
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k) o[k] = s.getItem(k) ?? "";
          }
        } catch {
          // storage unavailable — return what we have
        }
        return o;
      };
      return { local: dump(() => localStorage), session: dump(() => sessionStorage) };
    })
    .catch((e) => {
      console.log("⚠️ Could not read page storage, continuing with cookies only:", (e as Error).message);
      return { local: {} as Record<string, string>, session: {} as Record<string, string> };
    });
  console.log(
    `Captured ${Object.keys(storage.local).length} localStorage + ${Object.keys(storage.session).length} sessionStorage keys.`,
  );

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

  // Reload so the app boots with the injected storage in place.
  try {
    await bbPage.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  } catch {}
  await bbPage.waitForTimeout(8000);

  const pageState = await bbStagehand.extract(
    "Is this a login page or is the user logged in? Look for a login form vs the Facebook news feed / left nav.",
    z.object({ isLoginPage: z.boolean(), description: z.string() }),
  );

  await bbStagehand.close();

  if (pageState.isLoginPage) {
    console.log("\nCookies didn't carry over — Facebook required re-login from this IP.");
    console.log("Re-run 'npm run setup' and complete any checkpoint in the local browser.");
  } else {
    console.log(`\n✅ Success! Facebook is authenticated in the Browserbase context.`);
    console.log(`Context ID: ${contextId}`);
    console.log("Run 'npm start' to create a Marketplace listing.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
