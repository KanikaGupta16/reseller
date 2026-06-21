import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import * as fs from "fs";
import * as path from "path";

const LISTING_DIR = path.resolve("C:/Users/nailf/Documents/GitHub/reseller/Clothing");

interface Listing {
  title: string;
  price: number | string;
  category: string;
  brand: string;
  condition: string;
  size: string;
  quantity: number;
  description?: string;
  photos: string[];
}

function lenientJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = raw
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/("|\d|true|false|null)(\s*\r?\n\s*)(")/g, "$1,$2$3");
    return JSON.parse(repaired);
  }
}

function loadListing(dir: string): Listing {
  const content = fs.readFileSync(path.join(dir, "Content.txt"), "utf-8");
  const data = lenientJsonParse(content);

  const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

  const photos = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));

  return {
    title: str(data.title),
    price: data.price as number | string,
    category: str(data.category),
    brand: str(data.brand),
    condition: str(data.condition),
    size: str(data.size),
    quantity: (data.quantity as number) ?? 1,
    description: str(data.description),
    photos,
  };
}

/**
 * The Brand field is a typeahead combobox whose option list re-renders as you
 * type, so the agent's snapshot-based clicks land on the wrong row. We type via
 * stagehand.act() (which reliably populates the dropdown) and then click the
 * exact matching option against the LIVE DOM via page.evaluate(), which avoids
 * the stale-element-id problem entirely.
 */
async function setBrandDeterministic(
  stagehand: Stagehand,
  page: any,
  brand: string,
): Promise<boolean> {
  try {
    // 1. Locate the Brand <input> via the live DOM and tag it so we can drive it
    //    with the Locator API (real CDP keystrokes reliably open the react-select
    //    menu, unlike synthetic events).
    const found = await page.evaluate(() => {
      const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();
      const els = Array.from(document.querySelectorAll("label, span, div, p"));
      const labelEl = els.find((e) => e.children.length === 0 && norm(e.textContent) === "Brand");
      if (!labelEl) return "no-label";
      let container: Element | null = labelEl.parentElement;
      let input: HTMLInputElement | null = null;
      for (let i = 0; i < 6 && container; i++) {
        input = container.querySelector("input");
        if (input) break;
        container = container.parentElement;
      }
      if (!input) return "no-input";
      input.setAttribute("data-bot-brand", "1");
      return "tagged";
    });
    if (found !== "tagged") {
      console.log("Could not locate Brand input:", found);
      return false;
    }

    const input = page.locator('[data-bot-brand="1"]').first();
    await input.click();
    await page.waitForTimeout(300);
    await input.fill(""); // clear any existing value
    await page.waitForTimeout(300);
    await input.type(brand); // real keystrokes -> opens the suggestion menu
    await page.waitForTimeout(2500);

    // 2. Brand value doesn't need to match exactly — just pick the first
    //    available option in the dropdown (defensive: returns a status string).
    const clicked = await page.evaluate(() => {
      try {
        const norm = (s: string | null) => (s || "").replace(/\s+/g, " ").trim();
        const opts = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
        if (opts.length === 0) return "no-options";
        const t = opts[0];
        t.scrollIntoView({ block: "center" });
        t.click();
        return "clicked:" + norm(t.textContent);
      } catch (e) {
        return "err:" + (e as Error).message;
      }
    });

    console.log("Brand selection result:", clicked);
    await page.waitForTimeout(1000);
    return clicked.startsWith("clicked:");
  } catch (e) {
    console.log("Deterministic brand set failed:", (e as Error).message);
    return false;
  }
}

async function main() {
  const contextId = process.env.BROWSERBASE_CONTEXT_ID;
  if (!contextId) {
    console.error("No BROWSERBASE_CONTEXT_ID found. Run 'npm run setup' first to log in.");
    process.exit(1);
  }

  const listing = loadListing(LISTING_DIR);
  console.log("Loaded listing:");
  console.log(`  Title:     ${listing.title}`);
  console.log(`  Price:     $${listing.price}`);
  console.log(`  Category:  ${listing.category}`);
  console.log(`  Brand:     ${listing.brand}`);
  console.log(`  Condition: ${listing.condition}`);
  console.log(`  Size:      ${listing.size}`);
  console.log(`  Quantity:  ${listing.quantity}`);
  console.log(`  Photos:    ${listing.photos.length}`);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 1,
    browserbaseSessionCreateParams: {
      // Residential proxies help clear Cloudflare's "Verifying you are human"
      // interstitial that flags Browserbase's default datacenter IPs.
      proxies: true,
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

    // Navigate to depop.com first to pass Cloudflare, then to create page
    try {
      await page.goto("https://www.depop.com/", {
        waitUntil: "domcontentloaded",
        timeoutMs: 60000,
      });
    } catch {}
    await page.waitForTimeout(15000);

    try {
      await page.goto("https://www.depop.com/products/create/", {
        waitUntil: "domcontentloaded",
        timeoutMs: 60000,
      });
    } catch (navErr) {
      console.log("Navigation wait timed out, continuing anyway:", (navErr as Error).message);
    }

    // Wait for captcha/security checks to resolve
    let onCreateForm = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(attempt === 0 ? 12000 : 20000);

      let state;
      try {
        state = await stagehand.extract(
          "What kind of page is this? Is it: (1) the Depop 'create listing' / 'sell an item' form, " +
            "(2) a login page, or (3) a security/captcha/verification page?",
          z.object({
            isCreateForm: z.boolean(),
            isLoginPage: z.boolean(),
            isCaptcha: z.boolean(),
            description: z.string(),
          }),
        );
      } catch (e) {
        console.log(`Attempt ${attempt + 1}: session error, retrying...`, (e as Error).message);
        continue;
      }

      if (state.isCreateForm) {
        onCreateForm = true;
        break;
      }
      if (state.isLoginPage) {
        console.error("Landed on login page. Re-run 'npm run setup' to refresh the session.");
        return;
      }
      if (state.isCaptcha) {
        console.log(`Attempt ${attempt + 1}: captcha detected, waiting for Browserbase to solve...`);
        continue;
      }
      console.log(`Attempt ${attempt + 1}: unexpected page (${state.description}), retrying...`);
      try {
        await page.goto("https://www.depop.com/products/create/", {
          waitUntil: "domcontentloaded",
          timeoutMs: 60000,
        });
      } catch {}
    }

    if (!onCreateForm) {
      console.error("Could not reach the create-listing form.");
      await page.screenshot({ path: "debug.png" });
      return;
    }

    // Upload photos via setInputFiles (agent can't do file uploads)
    if (listing.photos.length > 0) {
      console.log(`Uploading ${listing.photos.length} photo(s)...`);
      const filePayloads = listing.photos.map((p) => ({
        name: path.basename(p),
        mimeType: p.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        buffer: fs.readFileSync(p),
      }));

      try {
        const input = page.locator('input[type="file"]').first();
        await input.setInputFiles(filePayloads);
        await page.waitForTimeout(8000);
        console.log("Photos uploaded.");
      } catch (e) {
        console.log("Photo upload failed:", (e as Error).message);
        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent("filechooser", { timeout: 10000 }),
            stagehand.act("click the photo upload area or 'Add photos' button"),
          ]);
          await fileChooser.setFiles(filePayloads);
          await page.waitForTimeout(8000);
          console.log("Photos uploaded via file chooser.");
        } catch (e2) {
          console.log("File chooser fallback failed:", (e2 as Error).message);
        }
      }
    }

    // Use agent() to fill the entire form and publish
    console.log("Starting agent to fill listing form...");
    const descriptionText = listing.description || listing.title;

    const agent = stagehand.agent({
      // gpt-4.1-mini has a much higher tokens-per-minute ceiling than gpt-4.1,
      // which the agent otherwise blows through by sending the full a11y tree
      // on every parallel act() call.
      model: "openai/gpt-4.1-mini",
    });

    // Pass 1: fill all fields, but do NOT post yet.
    const fillInstruction = `You are on the Depop "create listing" form. Photos have already been uploaded.
Fill in the following fields. Do NOT click "Post" or "Save as draft" yet — just fill the fields.

- Description: "${descriptionText}"
- Category: The Category field is a typeahead combobox. FIRST clear any existing text in it (click the clear "x" button, or select-all and delete) so it is EMPTY, THEN type "${listing.category}" and click the matching option from the dropdown. The final value must be exactly "${listing.category}" — never leave concatenated text like "SweatshirtsT-shirts".
- (Skip the Brand field entirely — it is handled separately. Do NOT touch the Brand combobox.)
- Size: Open the Size dropdown and select exactly "${listing.size}".
- Condition: Open the Condition dropdown and select the option whose text is EXACTLY "${listing.condition}". Do not pick "Brand new" or any other condition — it must be "${listing.condition}".
- Item price: Clear the Item price field (the one with the US$ prefix — NOT the Quantity field) and enter "${listing.price}".

Important notes:
- For dropdowns/comboboxes, click to open first, then click the option.
- Leave Quantity as 1.
- Skip optional fields not listed above (Color, Material, Body fit, Source, Age, Style, SKU, Boost).`;

    const fillResult = await agent.execute({ instruction: fillInstruction, maxSteps: 40 });
    console.log("Fill pass finished:", fillResult.message);

    // Brand is handled deterministically (agent clicks the wrong typeahead row).
    console.log(`Setting Brand to "${listing.brand}" deterministically...`);
    await setBrandDeterministic(stagehand, page, listing.brand);

    await page.screenshot({ path: "listing-filled.png" });
    console.log("Saved screenshot to listing-filled.png");

    // Verify the actual field values and correct any that are wrong before posting.
    const fieldCheck = z.object({
      description: z.string(),
      category: z.string(),
      brand: z.string(),
      size: z.string(),
      condition: z.string(),
      price: z.string(),
      missingOrErrorFields: z.string(),
    });

    let fields = await stagehand.extract(
      "Read the current values shown in the Depop create-listing form fields. Report the exact text " +
        "currently in: Description, Category, Brand, Size, Condition, and Item price. For " +
        "'missingOrErrorFields', list any fields that are empty or show a 'This field is required' / error message.",
      fieldCheck,
    );
    console.log("Field values after fill pass:", fields);

    const needsFix = (): string[] => {
      const problems: string[] = [];
      // Brand just needs to be non-empty (any option is acceptable).
      if (!fields.brand || fields.brand.trim() === "")
        problems.push(`Brand must not be empty (currently "${fields.brand}")`);
      if (
        !fields.condition ||
        fields.condition.toLowerCase().indexOf(listing.condition.toLowerCase()) === -1
      )
        problems.push(`Condition must be "${listing.condition}" (currently "${fields.condition}")`);
      if (!fields.category || fields.category.toLowerCase() !== listing.category.toLowerCase())
        problems.push(`Category must be "${listing.category}" (currently "${fields.category}")`);
      if (!fields.size || fields.size.toLowerCase().indexOf(listing.size.toLowerCase()) === -1)
        problems.push(`Size must be "${listing.size}" (currently "${fields.size}")`);
      if (!fields.price || fields.price.replace(/[^0-9.]/g, "") !== String(listing.price))
        problems.push(`Item price must be "${listing.price}" (currently "${fields.price}")`);
      return problems;
    };

    for (let fixAttempt = 0; fixAttempt < 2; fixAttempt++) {
      const problems = needsFix();
      if (problems.length === 0) break;
      console.log(`Correcting fields (attempt ${fixAttempt + 1}):`, problems);

      // Brand is corrected deterministically, not by the agent.
      const brandWrong = problems.some((p) => p.startsWith("Brand"));
      if (brandWrong) {
        console.log(`Re-setting Brand to "${listing.brand}" deterministically...`);
        await setBrandDeterministic(stagehand, page, listing.brand);
      }

      const agentProblems = problems.filter((p) => !p.startsWith("Brand"));
      if (agentProblems.length > 0) {
        const fixResult = await agent.execute({
          instruction:
            `You are on the Depop create-listing form. Some fields are wrong or empty. Fix ONLY these, ` +
            `do NOT click Post yet and do NOT touch the Brand field:\n- ${agentProblems.join("\n- ")}\n\n` +
            `For the Category typeahead combobox: clear the field first, type the value, wait for ` +
            `the dropdown, then click the exact matching option. For Condition/Size: open the dropdown and ` +
            `click the option whose text matches exactly.`,
          maxSteps: 25,
        });
        console.log("Correction pass finished:", fixResult.message);
      }
      fields = await stagehand.extract(
        "Read the current values shown in the Depop create-listing form fields: Description, Category, " +
          "Brand, Size, Condition, Item price, and list any empty/required fields in missingOrErrorFields.",
        fieldCheck,
      );
      console.log("Field values after correction:", fields);
    }

    const remaining = needsFix();
    if (remaining.length > 0) {
      console.warn("Fields still not correct, NOT posting:", remaining);
      await page.screenshot({ path: "listing-result.png" });
      console.log("Saved screenshot to listing-result.png");
      return;
    }

    // All fields good — post the listing.
    console.log("All fields verified. Posting listing...");
    const postResult = await agent.execute({
      instruction:
        'Scroll down and click the "Post" button to publish the listing. Do NOT click "Save as draft".',
      maxSteps: 10,
    });
    console.log("Post pass finished:", postResult.message);

    await page.waitForTimeout(4000);
    const verify = await stagehand.extract(
      "Did the listing get published successfully? Look for a success message, redirect to the listing " +
        "page or shop, or confirmation. Also report any error messages still visible on the form.",
      z.object({
        success: z.boolean(),
        hasErrors: z.boolean(),
        description: z.string(),
      }),
    );

    if (verify.success) {
      console.log("✅ Listing created successfully:", verify.description);
    } else if (verify.hasErrors) {
      console.log("⚠️ Listing had errors:", verify.description);
    } else {
      console.log("Listing status:", verify.description);
    }

    await page.screenshot({ path: "listing-result.png" });
    console.log("Saved screenshot to listing-result.png");
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
