import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import * as fs from "fs";
import * as path from "path";

// Folder that holds the listing photos (*.jpg/*.png) and a Content.txt describing
// the item. Swap this out to list a different product.
const LISTING_DIR = path.join(process.cwd(), "Nintendo Switch Sell");

interface MeetupPreferences {
  door_pickup?: boolean;
  door_dropoff?: boolean;
  public_meetup?: boolean;
}

interface Listing {
  title: string;
  price: string;
  category: string;
  condition: string;
  location: string;
  description: string;
  meetup: MeetupPreferences;
  photos: string[];
}

// Tolerate common hand-edit slips (trailing commas, a missing comma between
// a value and the next "key") before handing the text to JSON.parse.
function lenientJsonParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = raw
      // drop trailing commas before } or ]
      .replace(/,(\s*[}\]])/g, "$1")
      // insert a missing comma between `"value"` (or number/bool) and the next `"key":`
      .replace(/("|\d|true|false|null)(\s*\r?\n\s*)(")/g, "$1,$2$3");
    return JSON.parse(repaired);
  }
}

// Content.txt is a JSON object describing the item. Parse it into a structured
// listing and collect the image paths sitting next to it.
function loadListing(dir: string): Listing {
  const content = fs.readFileSync(path.join(dir, "Content.txt"), "utf-8");
  const data = lenientJsonParse(content);

  const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
  const meetup = (data.meetup_preferences ?? {}) as MeetupPreferences;

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
    location: str(data.location),
    description: str(data.description),
    meetup,
    photos,
  };
}

type SH = Stagehand;
type PG = ReturnType<SH["context"]["pages"]>[number];

// Toggle a single meetup/delivery preference ON, but ONLY if a control whose
// label genuinely matches is present. We observe candidates and require the
// returned element's description to contain the distinctive keyword (e.g.
// "door", "public") — this is what stops it from grabbing an unrelated switch
// like "Hide from friends". Returns true only when a matching control was found.
async function setMeetupPreference(stagehand: SH, page: PG, label: string, keyword: string): Promise<boolean> {
  const candidates = await stagehand.observe(
    `the toggle or checkbox control whose visible label is exactly "${label}", used to choose a meetup or delivery method for the marketplace listing`,
  );
  const match = candidates.find((c) => (c.description ?? "").toLowerCase().includes(keyword.toLowerCase()));
  if (!match) return false;
  await stagehand.act(match);
  await page.waitForTimeout(600);
  console.log(`  ✓ Enabled '${label}'`);
  return true;
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
  console.log(`  Price:     ${listing.price}`);
  console.log(`  Category:  ${listing.category}`);
  console.log(`  Condition: ${listing.condition}`);
  console.log(`  Location:  ${listing.location}`);
  console.log(`  Photos:    ${listing.photos.length} (${listing.photos.map((p) => path.basename(p)).join(", ")})`);

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

    // Land directly on the "create item" form.
    try {
      await page.goto("https://www.facebook.com/marketplace/create/item", {
        waitUntil: "domcontentloaded",
        timeoutMs: 60000,
      });
    } catch (navErr) {
      console.log("Navigation wait timed out, continuing anyway:", (navErr as Error).message);
    }
    await page.waitForTimeout(8000);

    // Bail early if we landed on a login page instead of the form.
    const state = await stagehand.extract(
      "Is this the Facebook Marketplace 'Create new listing' item form, or a login page?",
      z.object({ isCreateForm: z.boolean(), isLoginPage: z.boolean(), description: z.string() }),
    );
    if (state.isLoginPage || !state.isCreateForm) {
      console.error("Not on the create-listing form. Re-run 'npm run setup' to refresh the session.");
      console.error("Page state:", state.description);
      return;
    }

    // 1) Upload photos. The form has a hidden <input type="file"> that accepts
    //    multiple images; setInputFiles streams the local files to the remote
    //    Browserbase browser.
    if (listing.photos.length > 0) {
      console.log(`Uploading ${listing.photos.length} photo(s)...`);
      try {
        await page.locator('input[type="file"]').first().setInputFiles(listing.photos);
        await page.waitForTimeout(4000);
        console.log("Photos uploaded.");
      } catch (e) {
        console.log("⚠️ Photo upload failed:", (e as Error).message);
      }
    }

    // 2) Title
    console.log("Filling title...");
    await stagehand.act(`type '${listing.title}' into the Title field`);
    await page.waitForTimeout(800);

    // 3) Price
    console.log("Filling price...");
    await stagehand.act(`type '${listing.price}' into the Price field`);
    await page.waitForTimeout(800);

    // 4) Category (custom dropdown — open it, then pick the closest match).
    if (listing.category) {
      console.log("Selecting category...");
      try {
        await stagehand.act("click the Category dropdown field");
        await page.waitForTimeout(1500);
        await stagehand.act(
          "click the category option for 'Video Games & Consoles' (best match for the item)",
        );
        await page.waitForTimeout(1000);
      } catch (e) {
        console.log("⚠️ Category selection failed:", (e as Error).message);
      }
    }

    // 5) Condition (custom dropdown).
    if (listing.condition) {
      console.log("Selecting condition...");
      try {
        await stagehand.act("click the Condition dropdown field");
        await page.waitForTimeout(1500);
        await stagehand.act(`click the '${listing.condition}' condition option`);
        await page.waitForTimeout(1000);
      } catch (e) {
        console.log("⚠️ Condition selection failed:", (e as Error).message);
      }
    }

    // 6) Description
    console.log("Filling description...");
    await stagehand.act(`type '${listing.description.replace(/'/g, "\\'")}' into the Description field`);
    await page.waitForTimeout(800);

    // Screenshot the filled form before advancing.
    await page.screenshot({ path: "listing-filled.png" });
    console.log("Saved screenshot to listing-filled.png");

    // 7) Advance to publish. FB's create flow can be multi-step:
    //    fill form -> Next -> (optional audience/groups step) -> Publish.
    //    Rather than assume a fixed sequence, loop: on each step look for a
    //    real Publish button and click it; if there's only a Next button,
    //    click that and re-check. We detect buttons by their accessible label
    //    so we never confuse the live "Publish" control with the static
    //    preview card (which is what produced the earlier false positive).
    // Meetup/delivery prefs only appear on a later step of the flow (not on the
    // first details page), so we attempt them on every step and track which
    // we've set to avoid re-clicking (which would toggle them back off).
    const meetupTargets: { enabled: boolean | undefined; label: string; keyword: string }[] = [
      { enabled: listing.meetup.door_pickup, label: "Door pickup", keyword: "pickup" },
      { enabled: listing.meetup.door_dropoff, label: "Door dropoff", keyword: "dropoff" },
      { enabled: listing.meetup.public_meetup, label: "Public meetup", keyword: "public" },
    ];
    const meetupDone = new Set<string>();

    let published = false;
    for (let step = 0; step < 4 && !published; step++) {
      // Set any not-yet-set meetup prefs if their controls are on this step.
      for (const m of meetupTargets) {
        if (!m.enabled || meetupDone.has(m.label)) continue;
        try {
          if (await setMeetupPreference(stagehand, page, m.label, m.keyword)) {
            meetupDone.add(m.label);
          }
        } catch (e) {
          console.log(`⚠️ Could not set '${m.label}':`, (e as Error).message);
        }
      }

      const controls = await stagehand.extract(
        "Look only at the actual clickable buttons in the listing creation form (not the preview card on the right). " +
          "Is there an enabled button labeled exactly 'Publish'? Is there an enabled button labeled 'Next'?",
        z.object({ hasPublishButton: z.boolean(), hasNextButton: z.boolean() }),
      );

      if (controls.hasPublishButton) {
        console.log(`Step ${step + 1}: clicking Publish...`);
        const [publishAction] = await stagehand.observe(
          "the clickable 'Publish' button that submits/publishes the listing (a real button, not the preview)",
        );
        if (publishAction) {
          await stagehand.act(publishAction);
        } else {
          await stagehand.act("click the 'Publish' button");
        }
        await page.waitForTimeout(6000);
        published = true;
      } else if (controls.hasNextButton) {
        console.log(`Step ${step + 1}: clicking Next...`);
        await stagehand.act("click the 'Next' button");
        await page.waitForTimeout(3000);
      } else {
        console.log(`Step ${step + 1}: no Next/Publish button found, stopping.`);
        break;
      }
    }

    if (!published) {
      console.log("⚠️ Never reached a Publish button — the listing may only be saved as a draft.");
    }

    // 8) Verify against the source of truth — the seller's active listings page —
    //    NOT the preview card. A real published item shows up here; a draft does not.
    console.log("Verifying on 'Your listings'...");
    try {
      await page.goto("https://www.facebook.com/marketplace/you/selling", {
        waitUntil: "domcontentloaded",
        timeoutMs: 60000,
      });
    } catch {}
    await page.waitForTimeout(6000);

    const titleWords = listing.title.replace(/[()]/g, "").trim();
    const verify = await stagehand.extract(
      `On this 'Your listings / selling' page, is there an ACTIVE (published, not draft) listing whose title matches "${titleWords}"? ` +
        "Only count it as active if it appears in the published/active listings area, not under a 'Drafts' heading.",
      z.object({ isActive: z.boolean(), isDraftOnly: z.boolean(), description: z.string() }),
    );

    if (verify.isActive) {
      console.log("✅ Listing is LIVE on your listings page:", verify.description);
    } else if (verify.isDraftOnly) {
      console.log("⚠️ Listing exists only as a DRAFT — publish did not complete:", verify.description);
    } else {
      console.log("⚠️ Could not confirm the listing on your listings page:", verify.description);
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
