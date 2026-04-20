const { TableClient } = require("@azure/data-tables");
const https = require("https");
const { v4: uuidv4 } = require("uuid");

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TABLE_NAME = "NuggetEvents";
const CUBS_TEAM_ID = 112;
const MLB_BASE = "https://statsapi.mlb.com";

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function getClient() {
  const client = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME);
  try { await client.createTable(); } catch (_) {}
  return client;
}

async function alreadyExists(client, gameDate, pitcher, inning) {
  const year = String(new Date(gameDate).getFullYear());
  const iter = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${year}' and GameDate eq '${gameDate}' and Pitcher eq '${pitcher}' and Inning eq ${inning}`
    }
  });
  for await (const _ of iter) return true;
  return false;
}

module.exports = async function (context, req) {
  const providedPassword = req.headers["x-admin-password"];
  if (!ADMIN_PASSWORD || providedPassword !== ADMIN_PASSWORD) {
    context.res = {
      status: 401,
      body: { error: "Unauthorized" },
    };
    return;
  }

  if (!CONNECTION_STRING) {
    context.log("AZURE_STORAGE_CONNECTION_STRING not set — skipping mlb-sync");
    context.res = {
      status: 500,
      body: { error: "Missing AZURE_STORAGE_CONNECTION_STRING" },
    };
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  context.log(`mlb-sync running for ${today}`);

  // 1. Check schedule for Cubs home game today
  const schedule = await httpsGet(
    `${MLB_BASE}/api/v1/schedule?teamId=${CUBS_TEAM_ID}&date=${today}&sportId=1`
  );

  const games = schedule.dates?.[0]?.games ?? [];
  const homeGame = games.find(
    (g) => g.teams?.home?.team?.id === CUBS_TEAM_ID && g.status?.abstractGameState === "Final"
  );

  if (!homeGame) {
    context.log("No completed Cubs home game today");
    context.res = {
      status: 200,
      body: { message: "No completed Cubs home game today" },
    };
    return;
  }

  const gamePk = homeGame.gamePk;
  context.log(`Found home game gamePk=${gamePk}`);

  // 2. Fetch play-by-play
  const feed = await httpsGet(`${MLB_BASE}/api/v1.1/game/${gamePk}/feed/live`);
  const allPlays = feed.liveData?.plays?.allPlays ?? [];

  // 3. Tally Cubs pitcher strikeouts per inning
  // Cubs are the home team — they pitch in the top half (batting side = "top" = away team bats)
  const inningMap = {}; // "inning:pitcherName" -> strikeout count

  for (const play of allPlays) {
    const half = play.about?.halfInning; // "top" = away bats, Cubs pitch
    if (half !== "top") continue;

    const result = play.result?.eventType;
    if (result !== "strikeout") continue;

    const inning = play.about?.inning;
    const pitcher = play.matchup?.pitcher?.fullName;
    if (!pitcher || !inning) continue;

    const key = `${inning}:${pitcher}`;
    inningMap[key] = (inningMap[key] ?? 0) + 1;
  }

  // 4. Find keys with >= 3 Ks
  const qualifying = Object.entries(inningMap).filter(([, count]) => count >= 3);

  if (qualifying.length === 0) {
    context.log("No 3-strikeout innings found");
    context.res = {
      status: 200,
      body: { message: "No 3-strikeout innings found" },
    };
    return;
  }

  const client = await getClient();
  const year = String(new Date(today).getFullYear());

  const redemptionDate = new Date(today);
  redemptionDate.setDate(redemptionDate.getDate() + 1);
  const rd = redemptionDate.toISOString().split("T")[0];

  let insertedCount = 0;
  for (const [key] of qualifying) {
    const [inningStr, pitcher] = key.split(/:(.+)/); // split on first colon
    const inning = parseInt(inningStr, 10);

    if (await alreadyExists(client, today, pitcher, inning)) {
      context.log(`Already recorded: ${pitcher} inning ${inning}`);
      continue;
    }

    const entity = {
      partitionKey: year,
      rowKey: uuidv4(),
      GameDate: today,
      RedemptionDate: rd,
      Pitcher: pitcher,
      Inning: inning,
    };

    await client.createEntity(entity);
    insertedCount += 1;
    context.log(`Inserted event: ${pitcher} inning ${inning} on ${today}`);
  }

  context.res = {
    status: 200,
    body: {
      message: "mlb-sync completed",
      gameDate: today,
      qualifyingCount: qualifying.length,
      insertedCount,
    },
  };
};
