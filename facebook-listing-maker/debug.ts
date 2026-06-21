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
  console.log(`Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);
  const page = stagehand.context.pages()[0];

  const target = process.env.DEBUG_URL || "https://www.messenger.com/marketplace";
  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeoutMs: 60000 });
  } catch {}
  await page.waitForTimeout(12000);

  const info = await page.evaluate(() => {
    const out: Record<string, unknown> = {};
    out.url = location.href;
    out.title = document.title;
    out.iframes = document.querySelectorAll("iframe").length;
    out.bodyTextSample = (document.body?.innerText || "").trim().slice(0, 300);
    out.bodyChildCount = document.body?.childElementCount ?? 0;

    // Sample of all anchor hrefs
    const hrefs = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => (a as HTMLAnchorElement).getAttribute("href"))
      .filter((h): h is string => !!h);
    out.totalAnchors = hrefs.length;
    out.sampleHrefs = Array.from(new Set(hrefs)).slice(0, 40);

    // Anything that looks like a thread link
    out.threadLike = hrefs.filter((h) => /\/t\/|\/marketplace\/t\/|thread|\/e2ee\//.test(h)).slice(0, 20);

    // Role=link elements count
    out.roleLinks = document.querySelectorAll('[role="link"]').length;
    out.roleRows = document.querySelectorAll('[role="row"]').length;
    out.roleGrid = document.querySelectorAll('[role="grid"]').length;
    out.gridcells = document.querySelectorAll('[role="gridcell"]').length;

    // Composer candidates
    out.textboxes = document.querySelectorAll('[role="textbox"]').length;
    out.contentEditables = document.querySelectorAll('[contenteditable="true"]').length;
    out.textareas = document.querySelectorAll("textarea").length;

    // Describe the first few role=link elements in the nav/thread list
    out.firstLinks = Array.from(document.querySelectorAll('[role="link"]'))
      .slice(0, 10)
      .map((el) => ({
        href: el.getAttribute("href"),
        aria: el.getAttribute("aria-label"),
        text: (el.textContent || "").trim().slice(0, 60),
      }));

    return out;
  });

  console.log(JSON.stringify(info, null, 2));

  const iframeInfo = await page.evaluate(() => {
    const f = document.querySelector("iframe");
    return {
      src: f?.getAttribute("src") || null,
      title: f?.getAttribute("title") || null,
      width: (f as HTMLIFrameElement)?.clientWidth,
      height: (f as HTMLIFrameElement)?.clientHeight,
    };
  });
  console.log("IFRAME:", JSON.stringify(iframeInfo));

  // Wait a lot longer to definitively rule out "just slow".
  console.log("Waiting an extra 35s to see if threads ever load...");
  await page.waitForTimeout(35000);

  const after = await page.evaluate(() => ({
    anchors: document.querySelectorAll("a[href]").length,
    roleLinks: document.querySelectorAll('[role="link"]').length,
    textboxes: document.querySelectorAll('[role="textbox"]').length,
    localStorageKeys: Object.keys(localStorage).length,
    indexedDBNames: (window.indexedDB && "databases" in window.indexedDB) ? "supported" : "n/a",
    bodyText: (document.body?.innerText || "").trim().slice(0, 200),
  }));
  console.log("AFTER 35s WAIT:", JSON.stringify(after, null, 2));

  await page.screenshot({ path: "debug.png" });
  console.log("Saved screenshot to debug.png");

  await stagehand.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
