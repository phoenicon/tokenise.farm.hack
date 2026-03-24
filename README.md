
# TOKENISE.FARM

**Unlock farm liquidity without selling land.**  
Hedera-native real-world asset tokenisation for UK agriculture.

[![Hedera Testnet](https://img.shields.io/badge/Hedera-Testnet-00BAFF?style=flat-square)](https://hashscan.io/testnet)
[![HTS 0.0.8308219](https://img.shields.io/badge/HTS-0.0.8308219-00C853?style=flat-square)](https://hashscan.io/testnet/token/0.0.8308219)
[![HCS Active](https://img.shields.io/badge/HCS-Audit%20Layer-7B1FA2?style=flat-square)](https://hashscan.io/testnet)
[![Track](https://img.shields.io/badge/Track-Legacy%20Builders-1A237E?style=flat-square)](https://dorahacks.io)

---

## Demo

https://youtu.be/fHfIrFQ6tnQ

**Live app:** https://tokenise.locker  
**Live token:** https://hashscan.io/testnet/token/0.0.8308219

End-to-end flow: farm input → 25% calculation → token minted → on-chain audit visible

---

## The Problem

From April 2026, changes to Agricultural Property Relief (APR) introduce a 20% inheritance tax on farmland above £2.5M. For 47,000 UK farming families sitting on £500B+ of land value, this creates immediate liquidity pressure.

Farmers are asset-rich, cash-poor. Selling land is not an option. Traditional lending is slow, complex, and often forces over-leverage. Existing RWA platforms are built for institutions, not family farms.

---

## The Solution

A farmer-first system to unlock safe liquidity from land — without selling it.

**Enter → Calculate → Mint → Monitor**

Transforms farmland into a liquid financial primitive while retaining full ownership.

1. Farmer enters land details  
2. System calculates safe 25% collateral (hard capped)  
3. Intent logged immutably on Hedera via HCS  
4. HTS token minted representing the collateral value (1 token = £1)  
5. Scheduled transaction created for future collateral checks  

Farmer retains 100% ownership of land at all times.

---

## Live Proof

Token minted on Hedera Testnet — real HTS token created via backend and visible on-chain:

**Token ID:** `0.0.8308219`  
**Supply:** 650,000 tokens (≈ £650K liquidity from a £2.6M farm)  

https://hashscan.io/testnet/token/0.0.8308219

---

## Architecture

Frontend (React + Vite)
↓
Backend (Node.js + Express)
↓
Hedera Network
├── HTS — token creation
├── HCS — audit + intent logging
└── Scheduled Transactions — collateral monitoring
Smart Contract
└── FarmLTVGuard.sol — enforces 25% LTV ceiling

---

## Hedera Integration

**HTS (Token Service)**  
Creates fixed-supply token capped at 25% of farm value.

**HCS (Consensus Service)**  
Logs immutable audit events before and after tokenisation.

**Scheduled Transactions**  
Creates future collateral checks per farm.

**FarmLTVGuard.sol**  
Enforces the 25% LTV cap at contract level.

---

## The 25% Model

Tokenisation is strictly limited to 25% of estimated land value.

- Reduces systemic risk  
- Avoids forced liquidation  
- Aligns with conservative lending  
- Farmer retains full ownership  

---

## Security

- Private keys stored in `.env` (never exposed)
- All Hedera interactions handled server-side
- No frontend key exposure
- Hard cap enforced at mint level

---

## Business Model

- Tokenisation fee  
- Platform fee  
- Data and advisory services supporting farmer onboarding and partnerships  

---

## Roadmap

**Now**  
Live HTS minting, HCS audit, scheduled transactions, deployed system  

**Next**  
Wallet integration, compliance layer, stablecoin rails, land registry integration  

**Later**  
Farm pilots, secondary markets, lender integrations  

---

## Legacy Builders Disclosure

Builds on Ascension 2025 work:

Previously:
- 25% model concept  
- early frontend  
- architecture  

Built for Apex 2026:
- live HTS minting  
- HCS audit layer  
- scheduled transactions  
- Solidity LTV contract  
- full backend + frontend integration  

---

## Founder

**Colin Porter**

Computer scientist with 25+ years in distributed systems and infrastructure.  
Bitcoin-native since 2013.  

Built across 7+ hackathons — shipping real systems under pressure.

---

## Mission

**Keep the land. Unlock the value.**

A new financial infrastructure for rural Britain — enabling farmers to access liquidity without losing their land.
