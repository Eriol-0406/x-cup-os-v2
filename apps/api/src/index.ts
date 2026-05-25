import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { strategiesRouter } from "./routes/strategies.js";
import { usersRouter } from "./routes/users.js";
import { adminRouter } from "./routes/admin.js";
import { fixturesRouter } from "./routes/fixtures.js";
import { tournamentMarketsRouter } from "./routes/tournamentMarkets.js";
import { playerPropsRouter } from "./routes/playerProps.js";
import { predictionMarketsRouter } from "./routes/predictionMarkets.js";
import { statsRouter } from "./routes/stats.js";
import { warmupTeamCache } from "./lib/teams.js";

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, model: env.GROQ_MODEL, chainId: env.XLAYER_CHAIN_ID });
});

app.use("/strategies", strategiesRouter);
app.use("/users", usersRouter);
app.use("/admin", adminRouter);
app.use("/fixtures", fixturesRouter);
app.use("/tournament-markets", tournamentMarketsRouter);
app.use("/player-prop-markets", playerPropsRouter);
app.use("/prediction-markets", predictionMarketsRouter);
app.use("/stats", statsRouter);

app.listen(env.PORT, () => {
  console.log(`✅ x-cup-os api listening on http://localhost:${env.PORT}`);
  console.log(`   parser model: ${env.GROQ_MODEL}`);
  console.log(`   db: ${env.DATABASE_URL}`);
  console.log(`   wc: league ${env.WC_LEAGUE_ID} season ${env.WC_SEASON}`);
  // Pre-warm the team cache so the first /strategies/parse doesn't pay the round-trip.
  void warmupTeamCache();
});
