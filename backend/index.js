require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs/promises");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TokenMintTransaction,
  TokenType,
  TokenSupplyType
} = require("@hashgraph/sdk");
const { scheduleCollateralCheck } = require("./src/utils/scheduleCollateralCheck");
const { ensureAuditTopic, submitAuditMessage } = require("./src/utils/hcsAudit");

const app = express();
const PORT = process.env.PORT || 4000;
const DATA_FILE = path.join(__dirname, "farms.json");
const LTV_RATIO = parseFloat(process.env.LTV_RATIO || "0.25");

// -------- Hedera client setup --------

if (!process.env.OPERATOR_ID || !process.env.OPERATOR_KEY) {
  console.error("[FATAL] OPERATOR_ID and OPERATOR_KEY must be set in .env");
  process.exit(1);
}

const network = process.env.HEDERA_NETWORK || "testnet";
const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY);
const client = Client.forName(network);
client.setOperator(operatorId, operatorKey);

// -------- In-memory farm store (MVP) --------

/**
 * Farm shape:
 * {
 *   id: string,
 *   name: string,
 *   location: string,
 *   hectares: number,
 *   estimatedValueGBP: number,
 *   maxSafeTokenisationGBP: number,
 *   tokenSymbol: string,
 *   tokenName: string,
 *   tokenId: string | null,
 *   status: "registered" | "tokenised"
 * }
 */

let farms = [];

async function loadFarms() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    farms = JSON.parse(raw);
  } catch {
    farms = [];
  }
}

async function saveFarms() {
  await fs.writeFile(DATA_FILE, JSON.stringify(farms, null, 2));
}

// -------- Input validation helpers --------

function validateString(value, name, { minLength = 1, maxLength = 200 } = {}) {
  if (typeof value !== "string") {
    return `${name} must be a string`;
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    return `${name} must be at least ${minLength} character(s)`;
  }
  if (trimmed.length > maxLength) {
    return `${name} must be at most ${maxLength} characters`;
  }
  return null;
}

function validatePositiveNumber(value, name, { min = 0, max = Infinity } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return `${name} must be a number`;
  }
  if (num <= min) {
    return `${name} must be greater than ${min}`;
  }
  if (num > max) {
    return `${name} must be at most ${max}`;
  }
  return null;
}

// -------- Express middleware --------

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173"
}));
app.use(express.json());
app.use(morgan("dev"));

// Rate limit tokenise endpoint to prevent account fund exhaustion
const tokeniseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many tokenise requests — please wait a moment and try again." }
});

// -------- Routes --------

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "tokenise-farm-backend" });
});

// List all farms
app.get("/api/farms", (req, res) => {
  res.json({ farms });
});

// Get a single farm by id
app.get("/api/farms/:id", (req, res) => {
  const farm = farms.find(f => f.id === req.params.id);
  if (!farm) {
    return res.status(404).json({ error: "Farm not found" });
  }
  return res.json({ farm });
});

// Register a new farm and compute safe collateral
app.post("/api/farms", async (req, res) => {
  try {
    const errors = [
      validateString(req.body.name, "name", { maxLength: 100 }),
      validateString(req.body.location, "location", { maxLength: 100 }),
      validatePositiveNumber(req.body.estimatedValueGBP, "estimatedValueGBP", { min: 0, max: 5e8 }),
      req.body.hectares != null
        ? validatePositiveNumber(req.body.hectares, "hectares", { min: 0, max: 100000 })
        : null
    ].filter(Boolean);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    const farm = {
      id: uuidv4(),
      name: req.body.name.trim(),
      location: req.body.location.trim(),
      hectares: req.body.hectares != null ? Number(req.body.hectares) : null,
      estimatedValueGBP: Number(req.body.estimatedValueGBP),
      maxSafeTokenisationGBP: Number(req.body.estimatedValueGBP) * LTV_RATIO,
      status: "registered"
    };

    farms.push(farm);
    await saveFarms();

    return res.json({ farm });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to register farm" });
  }
});

// Tokenise a farm: create HTS fungible token on Hedera
app.post("/api/farms/:id/tokenise", tokeniseLimiter, async (req, res) => {
  try {
    const farmId = req.params.id;
    const farm = farms.find(f => f.id === farmId);

    if (!farm) {
      return res.status(404).json({ error: "Farm not found" });
    }

    if (farm.tokenId) {
      return res.json({ farm, message: "Farm already tokenised" });
    }

    // 1 token = £1 for this MVP
    const totalSupply = Number(farm.maxSafeTokenisationGBP);

    console.log(`[HTS] Creating token for farm ${farm.id} with supply ${totalSupply}`);

    const tokenName = farm.tokenName || `${farm.name} Token`;
    const tokenSymbol = farm.tokenSymbol || "FARM";

    const tx = new TokenCreateTransaction()
      .setTokenName(tokenName)
      .setTokenSymbol(tokenSymbol)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Finite)
      .setInitialSupply(0)
      .setMaxSupply(totalSupply)
      .setSupplyKey(operatorKey.publicKey)
      .setTreasuryAccountId(operatorId)          // treasury = operator for MVP
      .freezeWith(client);

    const signedTx = await tx.sign(operatorKey);
    const resp = await signedTx.execute(client);
    const txId = resp.transactionId.toString();
    const receipt = await resp.getReceipt(client);

    const mintedTokenId = receipt.tokenId.toString();
    console.log(`[HTS] Created tokenId ${mintedTokenId} for farm ${farm.id}`);

    const associateTx = await new TokenAssociateTransaction()
      .setAccountId(operatorId)
      .setTokenIds([mintedTokenId])
      .freezeWith(client);
    const signedAssociateTx = await associateTx.sign(operatorKey);
    const associateSubmit = await signedAssociateTx.execute(client);
    await associateSubmit.getReceipt(client);

    const mintTx = await new TokenMintTransaction()
      .setTokenId(mintedTokenId)
      .setAmount(totalSupply)
      .freezeWith(client);
    const signedMintTx = await mintTx.sign(operatorKey);
    const mintSubmit = await signedMintTx.execute(client);
    const mintReceipt = await mintSubmit.getReceipt(client);
    console.log("Mint receipt status:", mintReceipt.status.toString());
    console.log("Minted tokens to treasury:", mintedTokenId);

    farm.tokenId = mintedTokenId;
    farm.status = "tokenised";
    farm.mintedAt = new Date().toISOString();
    await saveFarms();

    const warnings = [];

    let scheduleResult = { scheduleId: null, executionTime: null };
    try {
      scheduleResult = await scheduleCollateralCheck(
        client,
        operatorId,
        operatorKey,
        farm.id,
        mintedTokenId,
        0.0003 // ~30 seconds for demo
      );
    } catch (scheduleError) {
      console.error("Collateral check scheduling failed:", scheduleError.message);
      warnings.push("Collateral check could not be scheduled — please retry.");
    }

    let hcsTopicId = null;
    let hcsSequenceNumber = null;
    let hcsRunningHash = null;
    try {
      const topicId = await ensureAuditTopic(client);
      const estimatedValue = farm.estimatedValueGBP || null;
      const auditPayload = {
        event: "farm_tokenised",
        farmId: farm.id,
        tokenId: mintedTokenId,
        txId,
        ltvBps: Math.round(LTV_RATIO * 10000),
        estimatedValueGBP: estimatedValue,
        maxSafeLiquidityGBP: (estimatedValue || 0) * LTV_RATIO,
        timestamp: new Date().toISOString()
      };
      const hcsResult = await submitAuditMessage(client, topicId, auditPayload);
      hcsTopicId = hcsResult.topicId;
      hcsSequenceNumber = hcsResult.sequenceNumber;
      hcsRunningHash = hcsResult.runningHash;
    } catch (hcsError) {
      console.error("HCS audit failed:", hcsError.message);
      warnings.push("HCS audit trail could not be recorded — please retry.");
    }

    return res.json({
      success: true,
      ...(warnings.length > 0 && { warnings }),
      farm,
      tokenId: mintedTokenId,
      txId,
      scheduleId: scheduleResult.scheduleId,
      nextCheck: scheduleResult.executionTime,
      hcsTopicId,
      hcsSequenceNumber,
      hcsRunningHash
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to tokenise farm", details: err.message });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// -------- Start server --------

loadFarms().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Tokenise.Farm backend listening on http://localhost:${PORT}`);
  });
});
