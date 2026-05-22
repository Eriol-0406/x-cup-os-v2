import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { strategiesRouter } from "./routes/strategies.js";

const app = express();

app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, model: env.GROQ_MODEL, chainId: env.XLAYER_CHAIN_ID });
});

app.use("/strategies", strategiesRouter);

app.listen(env.PORT, () => {
  console.log(`✅ x-cup-os api listening on http://localhost:${env.PORT}`);
  console.log(`   parser model: ${env.GROQ_MODEL}`);
  console.log(`   db: ${env.DATABASE_URL}`);
});
