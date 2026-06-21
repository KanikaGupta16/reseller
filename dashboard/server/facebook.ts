import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import { SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import * as http from "http";

interface ListingData {
  title: string;
  price: number;
  category: string;
  condition: string;
  location: string;
  description: string;
  meetup_preferences: {
    door_pickup: boolean;
    door_dropoff: boolean;
    public_meetup: boolean;
  };
  image_url: string | null;
  media_urls: string[];
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadPhotos(listing: ListingData): Promise<string[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-listing-"));
  const photos: string[] = [];

  const allUrls = [listing.image_url, ...listing.media_urls].filter(Boolean) as string[];

  for (let i = 0; i < allUrls.length; i++) {
    const ext = allUrls[i].match(/\.(png|jpg|jpeg|webp)/i)?.[1] || "jpg";
    const dest = path.join(tmpDir, `photo_${i + 1}.${ext}`);
    try {
      await downloadFile(allUrls[i], dest);
      photos.push(dest);
      console.log(`  [FB] Downloaded photo ${i + 1}: ${path.basename(dest)}`);
    } catch (err: any) {
      console.error(`  [FB] Failed to download photo ${i + 1}: ${err.message}`);
    }
  }

  return photos;
}

type SH = Stagehand;
type PG = ReturnType<SH["context"]["pages"]>[number];

async function setMeetupPreference(stagehand: SH, page: PG, label: string, keyword: string): Promise<boolean> {
  const candidates = await stagehand.observe(
    `the toggle or checkbox control whose visible label is exactly "${label}", used to choose a meetup or delivery method for the marketplace listing`,
  );
  const match = candidates.find((c) => (c.description ?? "").toLowerCase().includes(keyword.toLowerCase()));
  if (!match) return false;
  await stagehand.act(match);
  await page.waitForTimeout(600);
  console.log(`  [FB] Enabled '${label}'`);
  return true;
}

export async function publishToFacebook(
  supabase: SupabaseClient,
  itemId: string,
  listing: ListingData,
  onStatus: (status: string, step: string) => void
): Promise<{ success: boolean; message: string }> {
  const contextId = process.env.BROWSERBASE_CONTEXT_ID;
  if (!contextId) {
    return { success: false, message: "No BROWSERBASE_CONTEXT_ID. Run facebook-listing-maker setup first." };
  }

  onStatus("running", "downloading_photos");
  const photos = await downloadPhotos(listing);
  console.log(`[FB] ${photos.length} photos ready`);

  onStatus("running", "starting_browser");
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
    console.log(`[FB] Session: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);
    const page = stagehand.context.pages()[0];

    onStatus("running", "navigating");
    try {
      await page.goto("https://www.facebook.com/marketplace/create/item", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } catch {
      console.log("[FB] Navigation timed out, continuing...");
    }
    await page.waitForTimeout(8000);

    const state = await stagehand.extract(
      "Is this the Facebook Marketplace 'Create new listing' item form, or a login page?",
      z.object({ isCreateForm: z.boolean(), isLoginPage: z.boolean(), description: z.string() }),
    );

    if (state.isLoginPage || !state.isCreateForm) {
      return { success: false, message: `Not on create form: ${state.description}. Re-run facebook-listing-maker setup.` };
    }

    // Upload photos
    onStatus("running", "uploading_photos");
    if (photos.length > 0) {
      console.log("[FB] Uploading photos...");
      try {
        await page.locator('input[type="file"]').first().setInputFiles(photos);
        await page.waitForTimeout(4000);
        console.log("[FB] Photos uploaded");
      } catch (e: any) {
        console.log(`[FB] Photo upload failed: ${e.message}`);
      }
    }

    // Fill form
    onStatus("running", "filling_form");

    console.log("[FB] Filling title...");
    await stagehand.act(`type '${listing.title}' into the Title field`);
    await page.waitForTimeout(800);

    console.log("[FB] Filling price...");
    await stagehand.act(`type '${listing.price}' into the Price field`);
    await page.waitForTimeout(800);

    if (listing.category) {
      console.log("[FB] Selecting category...");
      try {
        await stagehand.act("click the Category dropdown field");
        await page.waitForTimeout(1500);
        await stagehand.act(`click the category option closest to '${listing.category}'`);
        await page.waitForTimeout(1000);
      } catch (e: any) {
        console.log(`[FB] Category failed: ${e.message}`);
      }
    }

    if (listing.condition) {
      console.log("[FB] Selecting condition...");
      try {
        await stagehand.act("click the Condition dropdown field");
        await page.waitForTimeout(1500);
        await stagehand.act(`click the '${listing.condition}' condition option`);
        await page.waitForTimeout(1000);
      } catch (e: any) {
        console.log(`[FB] Condition failed: ${e.message}`);
      }
    }

    console.log("[FB] Filling description...");
    await stagehand.act(`type '${listing.description.replace(/'/g, "\\'")}' into the Description field`);
    await page.waitForTimeout(800);

    // Advance and publish
    onStatus("running", "publishing");

    const meetupTargets = [
      { enabled: listing.meetup_preferences.door_pickup, label: "Door pickup", keyword: "pickup" },
      { enabled: listing.meetup_preferences.door_dropoff, label: "Door dropoff", keyword: "dropoff" },
      { enabled: listing.meetup_preferences.public_meetup, label: "Public meetup", keyword: "public" },
    ];
    const meetupDone = new Set<string>();

    let published = false;
    for (let step = 0; step < 4 && !published; step++) {
      for (const m of meetupTargets) {
        if (!m.enabled || meetupDone.has(m.label)) continue;
        try {
          if (await setMeetupPreference(stagehand, page, m.label, m.keyword)) {
            meetupDone.add(m.label);
          }
        } catch {}
      }

      const controls = await stagehand.extract(
        "Look only at the actual clickable buttons in the listing creation form (not the preview card on the right). " +
          "Is there an enabled button labeled exactly 'Publish'? Is there an enabled button labeled 'Next'?",
        z.object({ hasPublishButton: z.boolean(), hasNextButton: z.boolean() }),
      );

      if (controls.hasPublishButton) {
        console.log(`[FB] Step ${step + 1}: clicking Publish...`);
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
        console.log(`[FB] Step ${step + 1}: clicking Next...`);
        await stagehand.act("click the 'Next' button");
        await page.waitForTimeout(3000);
      } else {
        console.log(`[FB] Step ${step + 1}: no Next/Publish found, stopping.`);
        break;
      }
    }

    // Verify
    onStatus("running", "verifying");
    console.log("[FB] Verifying on 'Your listings'...");
    try {
      await page.goto("https://www.facebook.com/marketplace/you/selling", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } catch {}
    await page.waitForTimeout(6000);

    const verify = await stagehand.extract(
      `On this 'Your listings / selling' page, is there an ACTIVE (published, not draft) listing whose title matches "${listing.title}"?`,
      z.object({ isActive: z.boolean(), isDraftOnly: z.boolean(), description: z.string() }),
    );

    // Cleanup temp files
    for (const p of photos) {
      try { fs.unlinkSync(p); } catch {}
    }

    if (verify.isActive) {
      return { success: true, message: `Listing is LIVE: ${verify.description}` };
    } else if (verify.isDraftOnly) {
      return { success: false, message: `Saved as DRAFT only: ${verify.description}` };
    } else if (published) {
      return { success: true, message: "Publish clicked but couldn't verify — check Facebook manually." };
    } else {
      return { success: false, message: "Never reached Publish button." };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  } finally {
    await stagehand.close();
    console.log("[FB] Session closed");
  }
}
