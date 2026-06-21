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
  await localPage.goto("https://www.facebook.com");

  await waitForEnter("Press ENTER after you've logged into Facebook... ");

  // Grab cookies from the local browser
  const cookies = await localStagehand.context.cookies();
  const fbCookies = cookies.filter((c) => c.domain?.includes("facebook.com"));
  console.log(`Captured ${fbCookies.length} Facebook cookies.`);

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

  // Verify it works
  const bbPage = bbStagehand.context.pages()[0];
  await bbPage.goto("https://www.facebook.com");
  await bbPage.waitForTimeout(3000);

  const pageState = await bbStagehand.extract(
    "Is this a login page or is the user logged in? Look for login form vs news feed.",
    z.object({ isLoginPage: z.boolean(), description: z.string() }),
  );

  await bbStagehand.close();

  if (pageState.isLoginPage) {
    console.log("\nCookies didn't carry over — Facebook may require re-auth from a new IP.");
    console.log("Try running 'npm start' anyway, the context may still have persisted state.");
  } else {
    console.log("\nSuccess! Facebook is authenticated in Browserbase.");
    console.log(`Context ID: ${contextId}`);
    console.log("Run 'npm start' to use the authenticated session.");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
