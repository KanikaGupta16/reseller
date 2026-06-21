import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";

async function main() {
  const contextId = process.env.BROWSERBASE_CONTEXT_ID;
  if (!contextId) {
    console.error("No BROWSERBASE_CONTEXT_ID found. Run 'npm run setup' first to log in.");
    process.exit(1);
  }

  // Reuse the persistent Browserbase context populated by `npm run setup`
  // (cookies + localStorage from a real human login). No fresh credential
  // login here — that trips Meta's reCAPTCHA / checkpoint wall.
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

    const REPLY_TEXT = "ok bud this brwoserbase";
    const page = stagehand.context.pages()[0];

    // --- STEP 1: Open Facebook ---
    console.log("Step 1: Opening facebook.com...");
    try {
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
        timeoutMs: 60000,
      });
    } catch (navErr) {
      console.log("Navigation wait timed out, continuing anyway:", (navErr as Error).message);
    }
    await page.waitForTimeout(6000);

    const loginState = await stagehand.extract(
      "Is this a Facebook LOGIN page with an email/username field and a password field? Answer true ONLY if you can see login form inputs.",
      z.object({ isLoginPage: z.boolean(), description: z.string() }),
    );
    if (loginState.isLoginPage) {
      console.error("Hit a login page — the saved session expired. Re-run 'npm run setup'.");
      return;
    }

    // --- STEP 2: Go to Messenger ---
    console.log("Step 2: Navigating to Messenger...");
    const messengerLinks = await stagehand.observe(
      "find the Messenger button/icon in the Facebook top navigation bar (a chat/lightning bubble icon, usually top right)",
    );
    if (messengerLinks.length > 0) {
      await stagehand.act(messengerLinks[0]);
      await page.waitForTimeout(3000);
      // From the Messenger dropdown, open the full Messenger inbox.
      await stagehand.act("click the link to see all messages or open Messenger inbox");
    } else {
      console.log("Messenger icon not found via observe — navigating to the messages page directly.");
      try {
        await page.goto("https://www.facebook.com/messages/", {
          waitUntil: "domcontentloaded",
          timeoutMs: 60000,
        });
      } catch {}
    }
    await page.waitForTimeout(6000);

    // --- STEP 3: Open the Marketplace messages section ---
    console.log("Step 3: Opening Marketplace messages...");
    const marketplaceTabs = await stagehand.observe(
      "find the 'Marketplace' tab, filter, or folder in the Messenger conversation list (it groups marketplace buyer/seller chats)",
    );
    if (marketplaceTabs.length > 0) {
      await stagehand.act(marketplaceTabs[0]);
    } else {
      await stagehand.act("click the Marketplace tab or filter in the messages sidebar");
    }
    await page.waitForTimeout(5000);

    // --- STEP 4: Open the first Marketplace conversation ---
    console.log("Step 4: Opening the first Marketplace conversation...");
    let conversations: Awaited<ReturnType<typeof stagehand.observe>> = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      conversations = await stagehand.observe(
        "find the clickable conversation threads in the Marketplace chat list (each is a person's name with a message preview)",
      );
      console.log(`Attempt ${attempt + 1}: found ${conversations.length} conversation candidates`);
      if (conversations.length > 0) break;
      await page.waitForTimeout(5000);
    }
    if (conversations.length === 0) {
      await page.screenshot({ path: "debug.png" });
      console.error("No Marketplace conversations rendered. Saved debug.png");
      return;
    }
    // Click the conversation card to OPEN the chat thread.
    await stagehand.act(conversations[0]);
    await page.waitForTimeout(5000);

    // Confirm the chat actually opened (message history + reply box), rather than
    // still sitting on the inbox list. If not open, click it once more.
    let chatOpen = await stagehand.extract(
      "Is an individual chat conversation now OPEN, showing the message history thread and a reply text box at the bottom? Answer false if we are still looking at the inbox list of conversations.",
      z.object({ isOpen: z.boolean(), description: z.string() }),
    );
    if (!chatOpen.isOpen) {
      console.log("Chat didn't open on first click — clicking the conversation again...");
      await stagehand.act("click the first conversation card in the Marketplace inbox to open the chat");
      await page.waitForTimeout(5000);
      chatOpen = await stagehand.extract(
        "Is an individual chat conversation now OPEN, showing the message history thread and a reply text box at the bottom? Answer false if we are still on the inbox list.",
        z.object({ isOpen: z.boolean(), description: z.string() }),
      );
    }
    if (!chatOpen.isOpen) {
      await page.screenshot({ path: "debug.png" });
      console.error("Could not open the conversation thread. Saved debug.png. Note:", chatOpen.description);
      return;
    }
    console.log("Chat opened.");

    // --- STEP 5: Reply in the conversation ---
    console.log("Step 5: Waiting for the composer and replying...");
    let composer: Awaited<ReturnType<typeof stagehand.observe>> = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      composer = await stagehand.observe(
        "find the message reply text box at the very bottom of the OPEN chat conversation (the box with placeholder like 'Message...' or 'Aa'). Do NOT match the 'Search Marketplace' search box.",
      );
      console.log(`Composer attempt ${attempt + 1}: found ${composer.length} candidates`);
      if (composer.length > 0) break;
      await page.waitForTimeout(5000);
    }
    if (composer.length === 0) {
      await page.screenshot({ path: "debug.png" });
      console.error("The message composer never rendered (the chat may be read-only, e.g. 'You left the group'). Saved debug.png");
      return;
    }

    console.log("Typing the reply with act()...");
    await stagehand.act(composer[0]);
    await page.waitForTimeout(500);
    await stagehand.act(`type '${REPLY_TEXT}' into the message reply text box at the bottom of the open chat`);
    await page.waitForTimeout(1000);
    await stagehand.act("press the Enter key to send the message");
    await page.waitForTimeout(2500);

    // --- Verify ---
    const sendResult = await stagehand.extract(
      `Look at the most recent messages in the currently open conversation. Was a message saying '${REPLY_TEXT}' sent by the current user?`,
      z.object({ messageSent: z.boolean(), lastMessage: z.string() }),
    );
    if (sendResult.messageSent) {
      console.log("✅ Verified — message sent:", sendResult.lastMessage);
    } else {
      console.log("⚠️ Could not verify message was sent. Last message seen:", sendResult.lastMessage);
    }

    await page.screenshot({ path: "result.png" });
    console.log("Saved screenshot to result.png");
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
