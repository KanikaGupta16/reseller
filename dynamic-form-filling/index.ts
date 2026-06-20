import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import * as fs from "fs";

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
  });

  try {
    await stagehand.init();
    console.log(`Stagehand Session Started`);
    console.log(`Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);

    const page = stagehand.context.pages()[0];

    console.log("Navigating to FIFA homepage...");
    await page.goto("https://www.fifa.com/en/home");

    const agent = stagehand.agent({
      cua: false,
      model: "openai/gpt-4o-mini",
      systemPrompt: `You are navigating the FIFA website to find the FIFA World Cup 2026 standings page.
      Navigate from the homepage to find the World Cup 2026 section, then find the standings/groups page showing Group A.`,
    });

    console.log("Navigating to World Cup 2026 standings...");
    const navResult = await agent.execute({
      instruction: "From this FIFA homepage, navigate to the FIFA World Cup 2026 tournament page, then find and click on Standings or Groups to see the group stage standings. Make sure Group A is visible on the page.",
      maxSteps: 15,
    });

    console.log("Navigation result:", navResult.message);

    await page.waitForTimeout(3000);

    console.log("Extracting Group A standings...");
    const standings = await stagehand.extract(
      "Extract the Group A standings table from this page. For each team get: their position/rank, team name, matches played, wins, draws, losses, goals for, goals against, goal difference, and points.",
      z.object({
        group: z.string(),
        teams: z.array(
          z.object({
            position: z.number(),
            team: z.string(),
            played: z.number(),
            wins: z.number(),
            draws: z.number(),
            losses: z.number(),
            goalsFor: z.number(),
            goalsAgainst: z.number(),
            goalDifference: z.number(),
            points: z.number(),
          })
        ),
      })
    );

    console.log("Standings extracted:", JSON.stringify(standings, null, 2));

    let md = `# FIFA World Cup 2026 - ${standings.group}\n\n`;
    md += `| Pos | Team | MP | W | D | L | GF | GA | GD | Pts |\n`;
    md += `|-----|------|----|---|---|---|----|----|----|----- |\n`;
    for (const t of standings.teams) {
      md += `| ${t.position} | ${t.team} | ${t.played} | ${t.wins} | ${t.draws} | ${t.losses} | ${t.goalsFor} | ${t.goalsAgainst} | ${t.goalDifference} | ${t.points} |\n`;
    }

    const outputPath = "fifa_group_a_standings.md";
    fs.writeFileSync(outputPath, md);
    console.log(`\nStandings exported to ${outputPath}`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await stagehand.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
