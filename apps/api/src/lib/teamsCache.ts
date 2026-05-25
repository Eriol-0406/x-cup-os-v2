import { prisma } from "../db.js";
import { env } from "../env.js";
import { fetchStandings } from "./apiFootball.js";
import { fetchWCTeams } from "./teams.js";

/**
 * Populate the Team table from API-Football, including the group letter
 * pulled from /standings. Idempotent — upserts every row.
 *
 * Cost: 2 API calls (1 for /teams via the cached fetchWCTeams, 1 for
 * /standings).
 */
export async function cacheTeamsWithGroups(): Promise<{ cached: number; withGroup: number }> {
  const teams = await fetchWCTeams();

  // Build teamId → groupLetter map from standings.
  const groups = await fetchStandings();
  const teamGroup: Record<number, string> = {};
  for (const group of groups) {
    for (const row of group) {
      // row.group looks like "Group A", "Group B"
      const letter = row.group?.replace(/^Group\s+/i, "").trim() || null;
      if (letter) teamGroup[row.team.id] = letter;
    }
  }

  let cached = 0;
  let withGroup = 0;
  for (const t of teams) {
    const groupLetter = teamGroup[t.id] ?? null;
    if (groupLetter) withGroup++;
    await prisma.team.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        name: t.name,
        code: t.code,
        country: t.country,
        logo: t.logo,
        season: env.WC_SEASON,
        groupLetter,
      },
      update: {
        name: t.name,
        code: t.code,
        country: t.country,
        logo: t.logo,
        season: env.WC_SEASON,
        groupLetter,
        cachedAt: new Date(),
      },
    });
    cached++;
  }

  return { cached, withGroup };
}
