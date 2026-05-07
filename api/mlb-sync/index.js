const { TableClient } = require("@azure/data-tables");
const https = require("https");
const { v4: uuidv4 } = require("uuid");
const { getRedemptionDate } = require("../utils/redemptionDate");
const { createRateLimiter, getClientIp } = require("../utils/rateLimiter");
const { escapeOData } = require("../utils/odata");
const {
  getAuthConfigError,
  verifyAdminBearerToken,
  verifyLegacyPasswordHeader,
} = require("../utils/adminAuth");

const syncLimiter = createRateLimiter(5, 900_000);    // 5 req / 15 min

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const TABLE_NAME = "NuggetEvents";
const CUBS_TEAM_ID = 112;
const MLB_BASE = "https://statsapi.mlb.com";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePitcherName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  if (!/^[\p{L} .'-]+$/u.test(trimmed)) return null;
  return trimmed;
}

function isValidInning(value) {
  return Number.isInteger(value) && value >= 1 && value <= 20;
}

function setInternalError(context, error, message) {
  const errorId = uuidv4();
  context.log.error(`mlb-sync error [${errorId}]`, error);
  context.res = {
    status: 500,
    body: {
      error: message,
      errorId,
    },
  };
}

function httpsGet(url, timeoutMs = 10_000, maxBytes = 1_048_576) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const req = https.get(url, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        safeReject(new Error(`Request failed with status ${res.statusCode}: ${url}`));
        return;
      }

      const chunks = [];
      let receivedBytes = 0;
      res.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          const error = new Error(`Response exceeded ${maxBytes} bytes: ${url}`);
          safeReject(error);
          res.destroy(error);
          req.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        try {
          const data = Buffer.concat(chunks, receivedBytes).toString("utf8");
          safeResolve(JSON.parse(data));
        } catch (error) {
          safeReject(error);
        }
      });
    });
    req.on("error", safeReject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
    });
  });
}

async function getClient() {
  const client = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME);
  try {
    await client.createTable();
  } catch (_) {}
  return client;
}

async function alreadyExists(client, gameDate, pitcher, inning) {
  const parsedInning = parseInt(inning, 10);
  if (isNaN(parsedInning)) return false;
  const year = String(new Date(gameDate).getFullYear());
  const iter = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${escapeOData(year)}' and GameDate eq '${escapeOData(gameDate)}' and Pitcher eq '${escapeOData(pitcher)}' and Inning eq ${parsedInning}`,
    },
  });
  for await (const _ of iter) return true;
  return false;
}

module.exports = async function (context, req) {
  try {
    const { allowed, retryAfter } = syncLimiter.check(getClientIp(req));
    if (!allowed) {
      context.res = {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
        body: { error: "Too many requests", retryAfter },
      };
      return;
    }

    const authConfigError = getAuthConfigError();
    if (authConfigError) {
      context.res = {
        status: 500,
        body: { error: "Admin authentication misconfigured" },
      };
      return;
    }

    if (!verifyAdminBearerToken(req) && !verifyLegacyPasswordHeader(req)) {
      context.res = {
        status: 401,
        body: { error: "Unauthorized" },
      };
      return;
    }

    if (!CONNECTION_STRING) {
      context.log("AZURE_STORAGE_CONNECTION_STRING not set - skipping mlb-sync");
      context.res = {
        status: 500,
        body: { error: "Missing AZURE_STORAGE_CONNECTION_STRING" },
      };
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    context.log(`mlb-sync running for ${today}`);

    const schedule = await httpsGet(
      `${MLB_BASE}/api/v1/schedule?teamId=${CUBS_TEAM_ID}&date=${today}&sportId=1`
    );

    if (!isPlainObject(schedule) || !Array.isArray(schedule.dates)) {
      throw new Error("Invalid MLB schedule response shape");
    }

    const games = schedule.dates.flatMap((d) => (Array.isArray(d?.games) ? d.games : []));
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

    const feed = await httpsGet(`${MLB_BASE}/api/v1.1/game/${gamePk}/feed/live`, 10_000, 5_242_880);

    if (
      !isPlainObject(feed) ||
      !isPlainObject(feed.liveData) ||
      !isPlainObject(feed.liveData.plays) ||
      !Array.isArray(feed.liveData.plays.allPlays)
    ) {
      throw new Error("Invalid MLB live feed response shape");
    }

    const allPlays = feed.liveData.plays.allPlays;

    const inningMap = {};

    for (const play of allPlays) {
      if (!isPlainObject(play)) continue;
      const half = play.about?.halfInning;
      if (half !== "top") continue;

      const result = play.result?.eventType;
      if (result !== "strikeout") continue;

      const inning = play.about?.inning;
      if (!isValidInning(inning)) continue;

      const pitcher = normalizePitcherName(play.matchup?.pitcher?.fullName);
      if (!pitcher) continue;

      const key = `${inning}:${pitcher}`;
      inningMap[key] = (inningMap[key] ?? 0) + 1;
    }

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

    const rd = getRedemptionDate(today);

    let insertedCount = 0;
    for (const [key] of qualifying) {
      const [inningStr, pitcher] = key.split(/:(.+)/);
      const inning = parseInt(inningStr, 10);
      const normalizedPitcher = normalizePitcherName(pitcher);
      if (!normalizedPitcher || !isValidInning(inning)) continue;

      if (await alreadyExists(client, today, normalizedPitcher, inning)) {
        context.log(`Already recorded: ${normalizedPitcher} inning ${inning}`);
        continue;
      }

      const entity = {
        partitionKey: year,
        rowKey: uuidv4(),
        GameDate: today,
        RedemptionDate: rd,
        Pitcher: normalizedPitcher,
        Inning: inning,
      };

      await client.createEntity(entity);
      insertedCount += 1;
      context.log(`Inserted event: ${normalizedPitcher} inning ${inning} on ${today}`);
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
  } catch (error) {
    setInternalError(context, error, "mlb-sync failed");
  }
};
