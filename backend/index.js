require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType
} = require("@hashgraph/sdk");
const { scheduleCollateralCheck } = require("./src/utils/scheduleCollateralCheck");
const { ensureAuditTopic, submitAuditMessage } = require("./src/utils/hcsAudit");

const app = express();
const PORT = process.env.PORT || 4000;

// -------- Hedera client setup --------

if (!process.env.OPERATOR_ID || !process.env.OPERATOR_KEY) {
  console.warn("[WARN] OPERATOR_ID or OPERATOR_KEY missing from .env");
}

const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY);
const network = process.env.HEDERA_NETWORK || "testnet";

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

const farms = [];

// -------- Express middleware --------

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));

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

// Register a new farm and compute 25% safe collateral
app.post("/api/farms", (req, res) => {
  try {
    if (!req.body.name || !req.body.location || !req.body.estimatedValueGBP) {
      return res.status(400).json({ error: "name, location, estimatedValueGBP are required" });
    }

    const farm = {
      id: req.body.name,
      name: req.body.name,
      location: req.body.location,
      hectares: req.body.hectares,
      estimatedValueGBP: req.body.estimatedValueGBP,
      maxSafeTokenisationGBP: req.body.estimatedValueGBP * 0.25,
      status: "registered"
    };

    farms.push(farm);

    return res.json({ farm });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to register farm" });
  }
});

// Tokenise a farm: create HTS fungible token on Hedera
app.post("/api/farms/:id/tokenise", async (req, res) => {
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
    const initialSupply = BigInt(farm.maxSafeTokenisationGBP);

    console.log(`[HTS] Creating token for farm ${farm.id} with supply ${initialSupply.toString()}`);

    const tokenName = farm.tokenName || `${farm.name} Token`;
    const tokenSymbol = farm.tokenSymbol || "FARM";

    const tx = new TokenCreateTransaction()
      .setTokenName(tokenName)
      .setTokenSymbol(tokenSymbol)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Finite)
      .setInitialSupply(Number(initialSupply))   // SDK expects number for now
      .setMaxSupply(Number(initialSupply))
      .setTreasuryAccountId(operatorId)          // treasury = operator for MVP
      .freezeWith(client);

    const signedTx = await tx.sign(operatorKey);
    const resp = await signedTx.execute(client);
    const txId = resp.transactionId.toString();
    const receipt = await resp.getReceipt(client);

    const mintedTokenId = receipt.tokenId.toString();
    console.log(`[HTS] Created tokenId ${mintedTokenId} for farm ${farm.id}`);

    farm.tokenId = mintedTokenId;
    farm.status = "tokenised";

    let scheduleResult = { scheduleId: null, executionTime: null };
    try {
      scheduleResult = await scheduleCollateralCheck(
        farm.id,
        mintedTokenId,
        0.0003 // ~30 seconds for demo
      );
    } catch (scheduleError) {
      console.error("Collateral check scheduling failed:", scheduleError.message);
    }

    let hcsTopicId = null;
    let hcsSequenceNumber = null;
    let hcsRunningHash = null;
    try {
      const topicId = await ensureAuditTopic();
      const estimatedValue = farm.estimatedValueGBP || farm.estimatedValue || null;
      const auditPayload = {
        event: "farm_tokenised",
        farmId: farm.id,
        tokenId: mintedTokenId,
        txId,
        ltvBps: 2500,
        estimatedValueGBP: estimatedValue,
        maxSafeLiquidityGBP: (estimatedValue || 0) * 0.25,
        timestamp: new Date().toISOString()
      };
      const hcsResult = await submitAuditMessage(topicId, auditPayload);
      hcsTopicId = hcsResult.topicId;
      hcsSequenceNumber = hcsResult.sequenceNumber;
      hcsRunningHash = hcsResult.runningHash;
    } catch (hcsError) {
      console.error("HCS audit failed:", hcsError.message);
    }

    return res.json({
      success: true,
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

app.listen(PORT, () => {
  console.log(`🚀 Tokenise.Farm backend listening on http://localhost:${PORT}`);
});
