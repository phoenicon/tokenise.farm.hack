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

const app = express();
const PORT = process.env.PORT || 4000;

// -------- Hedera client setup --------

if (!process.env.OPERATOR_ID || !process.env.OPERATOR_KEY) {
  console.warn("[WARN] OPERATOR_ID or OPERATOR_KEY missing from .env");
}

const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromString(process.env.OPERATOR_KEY);
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

// Register a new farm and compute 25% safe collateral
app.post("/api/farms", (req, res) => {
  try {
    const { name, location, hectares, estimatedValueGBP, tokenSymbol, tokenName } = req.body;

    if (!name || !location || !estimatedValueGBP) {
      return res.status(400).json({ error: "name, location, estimatedValueGBP are required" });
    }

    const safe25 = Math.round(Number(estimatedValueGBP) * 0.25);

    const idBase = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    let id = idBase || `farm-${farms.length + 1}`;
    let n = 1;
    while (farms.find(f => f.id === id)) {
      id = `${idBase}-${n++}`;
    }

    const farm = {
      id,
      name,
      location,
      hectares: Number(hectares || 0),
      estimatedValueGBP: Number(estimatedValueGBP),
      maxSafeTokenisationGBP: safe25,
      tokenSymbol: tokenSymbol || "FARM",
      tokenName: tokenName || `${name} Token`,
      tokenId: null,
      status: "registered"
    };

    farms.push(farm);

    return res.status(201).json({ farm });
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

    const tx = new TokenCreateTransaction()
      .setTokenName(farm.tokenName)
      .setTokenSymbol(farm.tokenSymbol)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Finite)
      .setInitialSupply(Number(initialSupply))   // SDK expects number for now
      .setMaxSupply(Number(initialSupply))
      .setTreasuryAccountId(operatorId)          // treasury = operator for MVP
      .freezeWith(client);

    const signedTx = await tx.sign(operatorKey);
    const resp = await signedTx.execute(client);
    const receipt = await resp.getReceipt(client);

    const tokenId = receipt.tokenId.toString();
    console.log(`[HTS] Created tokenId ${tokenId} for farm ${farm.id}`);

    farm.tokenId = tokenId;
    farm.status = "tokenised";

    return res.json({ farm, tokenId });
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
