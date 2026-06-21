import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import * as fs from "fs";
import * as path from "path";

const LISTING_DIR = path.join(process.cwd(), "..", "Nintendo Switch Sell");

interface ShippingOptions {
  offer_shipping?: boolean;
  shipping_cost?: string;
  package_weight?: string;
}

interface Listing {
  title: string;
  price: string;
  category: string;
  condition: string;
  description: string;
  brand?: string;
  model?: string;
  color?: string;
  upc?: string;
  shipping: ShippingOptions;
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
  const shipping = (data.shipping ?? data.shipping_options ?? {}) as ShippingOptions;

  const photos = fs
    .readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));

  return {
    title: str(data.title),
    price: str(data.price),
    category: str(data.category),
    condition: str(data.condition),
    description: str(data.description),
    brand: str(data.brand) || undefined,
    model: str(data.model) || undefined,
    color: str(data.color) || undefined,
    upc: str(data.upc) || undefined,
    shipping,
    photos,
  };
}

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  return "image/jpeg"; // .jpg / .jpeg
}

// Read each photo into an explicit { name, mimeType, buffer } payload so the
// remote browser receives a proper MIME type. Passing bare paths makes eBay's
// client-side validation see "octet-stream" and reject the upload.
function photoPayloads(photos: string[]) {
  return photos.map((p) => ({
    name: path.basename(p),
    mimeType: mimeFor(p),
    buffer: fs.readFileSync(p),
  }));
}

function ebayCondition(c: string): string {
  const map: Record<string, string> = {
    new: "New",
    "open box": "Open box",
    used: "Used",
    "for parts": "For parts or not working",
    "not working": "For parts or not working",
  };
  return map[c.toLowerCase()] ?? "New";
}

type AnyPage = any;

async function main() {
  const contextId = process.env.BROWSERBASE_CONTEXT_ID;
  if (!contextId) {
    console.error("No BROWSERBASE_CONTEXT_ID found. Run 'npm run setup' first to log in.");
    process.exit(1);
  }

  const listing = loadListing(LISTING_DIR);
  console.log("Loaded listing:");
  console.log(`  Title:       ${listing.title}`);
  console.log(`  Price:       ${listing.price}`);
  console.log(`  Condition:   ${listing.condition} -> ${ebayCondition(listing.condition)}`);
  console.log(`  Description: ${listing.description.substring(0, 70)}...`);
  console.log(`  Photos:      ${listing.photos.length} (${listing.photos.map((p) => path.basename(p)).join(", ")})`);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 1,
    browserbaseSessionCreateParams: {
      browserSettings: {
        solveCaptchas: true,
        context: { id: contextId, persist: true },
      },
    },
  });

  try {
    await stagehand.init();
    console.log("Session started");
    console.log(`Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);

    const page: AnyPage = stagehand.context.pages()[0];

    // Snapshot helper: returns a coarse description of which step we're on.
    const whereAmI = async () =>
      stagehand.extract(
        "Classify the current eBay page/state. " +
          "Is the 'Find a match' product-search page showing (heading 'Find a match' and product cards)? " +
          "Is a 'Confirm details' modal open (asks to 'Select the condition of your item' with a 'Continue to listing' button)? " +
          "Is the full listing form showing (sections like Photos, Title, Item specifics, Pricing, with a 'List it' button)? " +
          "Is a 'Confirm account details' page showing (verify name/phone/address)? " +
          "Is a listing success/confirmation page showing?",
        z.object({
          isFindMatch: z.boolean(),
          isConfirmDetailsModal: z.boolean(),
          isListingForm: z.boolean(),
          isAccountConfirm: z.boolean(),
          isSuccess: z.boolean(),
          note: z.string(),
        }),
      );

    // ───────────────────────────────────────────────────────────────
    // PHASE 1: Prelist — search
    // ───────────────────────────────────────────────────────────────
    const prelistUrl = `https://www.ebay.com/sl/prelist/suggest?title=${encodeURIComponent(listing.title)}`;
    console.log(`Navigating to: ${prelistUrl}`);
    try {
      await page.goto(prelistUrl, { waitUntil: "domcontentloaded", timeoutMs: 60000 });
    } catch (e) {
      console.log("Nav timeout, continuing:", (e as Error).message);
    }
    await page.waitForTimeout(5000);

    const login = await stagehand.extract(
      "Is this a sign-in/login page?",
      z.object({ isLoginPage: z.boolean() }),
    );
    if (login.isLoginPage) {
      console.error("Not logged in. Re-run 'npm run setup'.");
      return;
    }

    console.log("Clicking Search...");
    {
      const [searchBtn] = await stagehand.observe("the blue Search button (magnifying glass) next to the title input");
      if (searchBtn) await stagehand.act(searchBtn);
      else await stagehand.act("click the blue Search button");
    }
    await page.waitForTimeout(8000);

    // ───────────────────────────────────────────────────────────────
    // PHASE 2: "Find a match" — click "Continue without match", verified
    // ───────────────────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      const here = await whereAmI();
      console.log(`State: ${here.note}`);
      if (!here.isFindMatch) break; // already advanced

      console.log(`Clicking 'Continue without match' (try ${i + 1})...`);
      const [cwm] = await stagehand.observe(
        "the 'Continue without match' button at the very bottom center of the page (NOT a filter chip like Model/Brand/Color)",
      );
      if (cwm) await stagehand.act(cwm);
      else await stagehand.act("click the 'Continue without match' button at the bottom of the page");
      await page.waitForTimeout(6000);
    }

    // ───────────────────────────────────────────────────────────────
    // PHASE 3: "Confirm details" modal — pick condition, continue
    // ───────────────────────────────────────────────────────────────
    {
      const here = await whereAmI();
      console.log(`State: ${here.note}`);
      if (here.isConfirmDetailsModal) {
        const cond = ebayCondition(listing.condition);
        console.log(`Confirm-details modal: selecting condition '${cond}'...`);
        const [radio] = await stagehand.observe(
          `the '${cond}' condition radio button inside the 'Confirm details' modal`,
        );
        if (radio) await stagehand.act(radio);
        else await stagehand.act(`click the '${cond}' radio button`);
        await page.waitForTimeout(1000);

        console.log("Clicking 'Continue to listing'...");
        const [cont] = await stagehand.observe("the 'Continue to listing' button");
        if (cont) await stagehand.act(cont);
        else await stagehand.act("click the 'Continue to listing' button");
        await page.waitForTimeout(7000);
      }
    }

    // ───────────────────────────────────────────────────────────────
    // PHASE 4: Listing form — verify we got here
    // ───────────────────────────────────────────────────────────────
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "listing-form.png" });
    {
      const here = await whereAmI();
      console.log(`State: ${here.note}`);
      if (!here.isListingForm) {
        console.error("Did not reach the listing form. Screenshot: listing-form.png");
        return;
      }
    }
    console.log("Reached the listing form.");

    // 4a) Photos — eBay's uploader. Try direct file input, then deep/pierce, then click upload button.
    if (listing.photos.length > 0) {
      console.log(`Uploading ${listing.photos.length} photo(s)...`);
      let uploaded = false;
      const payloads = photoPayloads(listing.photos);

      // eBay's photo uploader keeps its <input type="file"> inside an iframe,
      // so the main-frame locator silently matches nothing. Walk every frame
      // (main + iframes) and set files on the first file input we find.
      const frames = page.frames();
      console.log(`  Scanning ${frames.length} frame(s) for a file input...`);
      for (const frame of frames) {
        if (uploaded) break;
        let frameUrl = "";
        try {
          frameUrl = (frame.url && frame.url()) || "";
        } catch {}
        try {
          const input = frame.locator('input[type="file"]');
          await input.first().setInputFiles(payloads);
          await page.waitForTimeout(6000);
          uploaded = true;
          console.log(`  Photos set on file input in frame: ${frameUrl || "(main)"}`);
        } catch (e) {
          // No file input in this frame (or not settable) — keep scanning.
        }
      }

      // Fallback: click "Upload from computer", then re-scan frames.
      if (!uploaded) {
        try {
          const [uploadBtn] = await stagehand.observe(
            "the 'Upload from computer' button in the photos section",
          );
          if (uploadBtn) await stagehand.act(uploadBtn);
          await page.waitForTimeout(2500);
          for (const frame of page.frames()) {
            if (uploaded) break;
            try {
              await frame.locator('input[type="file"]').first().setInputFiles(payloads);
              await page.waitForTimeout(6000);
              uploaded = true;
              console.log("  Photos set after clicking upload button.");
            } catch {}
          }
        } catch (e) {
          console.log("  Upload-button fallback failed:", (e as Error).message);
        }
      }

      if (uploaded) {
        // Confirm eBay actually accepted at least one image before moving on.
        await page.waitForTimeout(2000);
        const photoState = await stagehand.extract(
          "In the Photos section of the listing form, how many photo thumbnails have been successfully added/uploaded? Are there any upload errors?",
          z.object({ photoCount: z.number(), hasError: z.boolean(), note: z.string() }),
        );
        console.log(`  Photo check: ${photoState.photoCount} photo(s). ${photoState.note}`);
      } else {
        console.log("  ⚠️ Could not find a file input in any frame.");
      }
    }

    // 4b) Title — usually pre-filled
    const titleCheck = await stagehand.extract(
      "What is the current value in the item Title input field?",
      z.object({ currentTitle: z.string() }),
    );
    if (!titleCheck.currentTitle.trim()) {
      console.log("Filling title...");
      const [t] = await stagehand.observe("the item Title input field");
      if (t) await stagehand.act(t);
      await page.waitForTimeout(300);
      await page.type(listing.title);
    } else {
      console.log(`Title already filled: "${titleCheck.currentTitle}"`);
    }

    // 4c) Price
    console.log("Filling price...");
    try {
      const [priceField] = await stagehand.observe("the Price / 'Buy It Now price' input field");
      if (priceField) await stagehand.act(priceField);
      else await stagehand.act("click the Price input field");
      await page.waitForTimeout(300);
      await page.keyPress("Ctrl+a");
      await page.waitForTimeout(150);
      await page.type(listing.price);
      console.log(`  Price set to ${listing.price}`);
    } catch (e) {
      console.log("  Price fill failed:", (e as Error).message);
    }
    await page.waitForTimeout(600);

    // 4d) Description
    if (listing.description) {
      console.log("Filling description...");
      try {
        const [desc] = await stagehand.observe("the Description text area / rich text editor body");
        if (desc) await stagehand.act(desc);
        else await stagehand.act("click the Description text area to focus it");
        await page.waitForTimeout(500);
        await page.type(listing.description);
        console.log("  Description filled.");
      } catch (e) {
        console.log("  Description fill failed:", (e as Error).message);
      }
      await page.waitForTimeout(600);
    }

    // 4e) Item specifics (optional)
    for (const [label, value] of [
      ["Brand", listing.brand],
      ["Model", listing.model],
      ["Color", listing.color],
      ["UPC", listing.upc],
    ] as const) {
      if (!value) continue;
      console.log(`Filling ${label}...`);
      try {
        await stagehand.act(`click the ${label} input field and type '${value}'`);
        await page.waitForTimeout(700);
      } catch (e) {
        console.log(`  ${label} skipped:`, (e as Error).message);
      }
    }

    await page.screenshot({ path: "listing-filled.png" });
    console.log("Saved screenshot: listing-filled.png");

    // ───────────────────────────────────────────────────────────────
    // PHASE 5: Submit — "List it", handle any blocking modal/validation
    // ───────────────────────────────────────────────────────────────
    let listed = false;
    for (let attempt = 0; attempt < 3 && !listed; attempt++) {
      console.log(`List attempt ${attempt + 1}...`);
      await stagehand.act("scroll to the very bottom of the page");
      await page.waitForTimeout(1000);

      const [listBtn] = await stagehand.observe("the 'List it' button that publishes the listing");
      if (listBtn) await stagehand.act(listBtn);
      else await stagehand.act("click the 'List it' button");
      await page.waitForTimeout(6000);

      const here = await whereAmI();
      console.log(`Post-List state: ${here.note}`);

      if (here.isSuccess) {
        listed = true;
      } else if (here.isAccountConfirm) {
        console.log("Confirm-account-details page — completing...");
        await stagehand.act("scroll to the bottom of the page");
        await page.waitForTimeout(800);
        const [contBtn] = await stagehand.observe("the 'Continue' / 'Confirm' / 'Submit' button to confirm account details");
        if (contBtn) await stagehand.act(contBtn);
        else await stagehand.act("click the Continue or Confirm button");
        await page.waitForTimeout(8000);
        listed = true;
      } else {
        // Likely a validation error or a condition modal blocking. Handle it.
        const block = await stagehand.extract(
          "Is there a modal or error blocking submission? What does it say and what fields are flagged? " +
            "Is it an 'Item condition' modal with radio options?",
          z.object({
            hasBlocker: z.boolean(),
            message: z.string(),
            isConditionModal: z.boolean(),
          }),
        );
        console.log(`  Blocker: ${block.message}`);
        if (block.isConditionModal) {
          const cond = ebayCondition(listing.condition);
          await stagehand.act(`click the '${cond}' radio button`);
          await page.waitForTimeout(700);
          await stagehand.act("click the 'Done' button");
          await page.waitForTimeout(1500);
        } else if (block.hasBlocker) {
          // dismiss generic modal then retry
          try {
            await stagehand.act("click the close, OK, or Done button on the modal");
            await page.waitForTimeout(1200);
          } catch {}
        }
      }
    }

    // ───────────────────────────────────────────────────────────────
    // PHASE 6: Verify
    // ───────────────────────────────────────────────────────────────
    console.log("Verifying...");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "listing-result.png" });

    if (!listed) {
      // Never left the form — submission was blocked (e.g. failed validation).
      console.log("⚠️ Listing was NOT submitted — the form blocked it (check listing-result.png).");
    } else {
      const result = await stagehand.extract(
        "Does the page confirm the listing was created/published? Look for 'Your listing is live', " +
          "'Congratulations', an item number, or similar. Set isSuccess=false if we are still on the " +
          "'Complete your listing' form with a 'List it' button. What page are we on now?",
        z.object({ isSuccess: z.boolean(), listingId: z.string().optional(), description: z.string() }),
      );

      if (result.isSuccess) {
        console.log(`✅ Listing is LIVE! ${result.listingId ? `Item #${result.listingId}` : ""}`);
        console.log(result.description);
      } else {
        console.log("⚠️ Could not confirm listing:", result.description);
      }
    }
    console.log("Saved screenshot: listing-result.png");
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
