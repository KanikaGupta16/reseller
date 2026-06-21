import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";

async function main() {
  const contextId = process.env.BROWSERBASE_CONTEXT_ID!;
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
    browserbaseSessionCreateParams: {
      proxies: true,
      browserSettings: {
        solveCaptchas: true,
        context: { id: contextId, persist: true },
      },
    },
  });

  await stagehand.init();
  console.log("");
  console.log("====================================================================");
  console.log(`  WATCH LIVE: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);
  console.log("====================================================================");
  console.log("");

  const page = stagehand.context.pages()[0];
  const target = "https://www.messenger.com/marketplace/t/1331710768457774";

  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  } catch (e) {
    console.log("Navigation wait timed out, continuing anyway:", (e as Error).message);
  }
  console.log("Navigated to:", target);
  console.log("Idling 5 minutes — open the live URL above to watch.");

  const totalMs = 5 * 60 * 1000;
  const stepMs = 30 * 1000;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    await page.waitForTimeout(stepMs);
    const mins = ((elapsed + stepMs) / 60000).toFixed(1);
    try {
      await page.screenshot({ path: "debug.png" });
      console.log(`[${mins} min] watching... (saved debug.png)`);
    } catch (e) {
      console.log(`[${mins} min] watching... (screenshot failed: ${(e as Error).message})`);
    }
  }

  console.log("5 minutes elapsed. Closing.");
  await stagehand.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
