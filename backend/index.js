require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
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

// -------- Hedera client setup --------

const hasOperatorCredentials = Boolean(process.env.OPERATOR_ID && process.env.OPERATOR_KEY);
if (!hasOperatorCredentials) {
  console.warn("[WARN] OPERATOR_ID or OPERATOR_KEY missing from .env");
}

const network = process.env.HEDERA_NETWORK || "testnet";
const operatorId = hasOperatorCredentials ? AccountId.fromString(process.env.OPERATOR_ID) : null;
const operatorKey = hasOperatorCredentials ? PrivateKey.fromStringECDSA(process.env.OPERATOR_KEY) : null;
const client = hasOperatorCredentials ? Client.forName(network) : null;
if (client && operatorId && operatorKey) {
  client.setOperator(operatorId, operatorKey);
}

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

if (fs.existsSync(DATA_FILE)) {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  farms = JSON.parse(raw);
}

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
    fs.writeFileSync(DATA_FILE, JSON.stringify(farms, null, 2));

    return res.json({ farm });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to register farm" });
  }
});

// Tokenise a farm: create HTS fungible token on Hedera
app.post("/api/farms/:id/tokenise", async (req, res) => {
  try {
    if (!hasOperatorCredentials || !client || !operatorId || !operatorKey) {
      return res.status(500).json({ error: "Backend not configured: missing OPERATOR_ID/OPERATOR_KEY" });
    }

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
    fs.writeFileSync(DATA_FILE, JSON.stringify(farms, null, 2));

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
