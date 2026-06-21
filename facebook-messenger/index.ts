import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";

async function main() {
  const contextId = process.env.BROWSERBASE_CONTEXT_ID;
  if (!contextId) {
    console.error("No BROWSERBASE_CONTEXT_ID found. Run 'npm run setup' first to log in.");
    process.exit(1);
  }

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 1,
    browserbaseSessionCreateParams: {
      browserSettings: {
        solveCaptchas: true,
        context: {
          id: contextId,
          persist: true,
        },
      },
    },
  });

  try {
    await stagehand.init();
    console.log("Session started");
    console.log(`Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);

    const page = stagehand.context.pages()[0];
    await page.goto("https://www.facebook.com");
    await page.waitForTimeout(2000);

    const pageState = await stagehand.extract(
      "Is this a login page or is the user logged in? Look for login form vs news feed.",
      z.object({ isLoginPage: z.boolean(), description: z.string() }),
    );

    if (pageState.isLoginPage) {
      console.error("Not logged in. Run 'npm run setup' to authenticate first.");
      return;
    }

    console.log("Authenticated via persistent context!");
    console.log("Current URL:", page.url());

    // --- Your automation logic goes here ---

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await stagehand.close();
    console.log("Session closed");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
