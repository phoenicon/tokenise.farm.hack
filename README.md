# TOKENISE.FARM

Unlocking farm liquidity without selling land

Hedera-native real-world asset tokenisation for UK agriculture


[![Hedera Testnet](https://img.shields.io/badge/Hedera-Testnet-00BAFF?style=flat-square)](https://hashscan.io/testnet)
[![HTS 0.0.8308219](https://img.shields.io/badge/HTS-0.0.8308219-00C853?style=flat-square)](https://hashscan.io/testnet/token/0.0.8308219)
[![HCS Active](https://img.shields.io/badge/HCS-Audit%20Layer-7B1FA2?style=flat-square)](https://hashscan.io/testnet)
[![Track](https://img.shields.io/badge/Track-Legacy%20Builders-1A237E?style=flat-square)](https://dorahacks.io)


## Live Proof

Token minted on Hedera Testnet

https://hashscan.io/testnet/token/0.0.8308219

This is a real HTS token created via the backend API and surfaced in the frontend dashboard.


## Why This Matters

From April 2026, proposed changes to Agricultural Property Relief (APR) introduce additional financial pressure for many UK farming families.

Land-rich, cash-poor is a common position:

- High asset value  
- Limited liquidity  
- Slow access to finance  

Traditional lending can take weeks or months. This system reduces that process to minutes.


## Legacy Builders Disclosure (Rule 4.6)

This project builds on earlier work from the Hedera Hello Future: Ascension 2025 hackathon.

Previously implemented:

- Core architecture and 25% collateral model  
- Initial HTS token minting flow  
- Basic React frontend  

Built for Apex 2026:

- Express backend with live HTS minting  
- HCS integration as an intent-first audit layer  
- Scheduled transactions for collateral checks  
- Solidity LTV guard contract  
- API-connected frontend dashboard  
- Live deployment  


## Problem

UK farmers often hold significant value in land but lack accessible liquidity.

- Selling land is not desirable  
- Lending processes are slow  
- Existing RWA platforms are not designed for individual farmers  


## Solution

Tokenise.Farm enables farmers to unlock a portion of land value without selling the asset.

1. Farm data is entered  
2. System calculates safe collateral (25%)  
3. Intent logged on Hedera (HCS)  
4. Token minted (HTS)  
5. Future checks scheduled  


## Architecture

Frontend  
React + Vite  

Backend  
Node.js + Express  

Blockchain  
Hedera HTS (tokenisation)  
Hedera HCS (audit layer)  
Hedera Scheduled Transactions  

Smart Contract  
Solidity LTV guard enforcing the 25% cap  


## Hedera Integration

HCS  
Intent logged before token creation. Immutable and auditable.

HTS  
Creates fixed-supply token representing farm value.

Scheduled Transactions  
Triggers future collateral checks on-chain.


## 25% Collateral Model

Tokenisation is limited to 25% of the estimated farm value.

- Reduces risk  
- Avoids forced liquidation  
- Aligns with conservative lending  


## Business Model

- Tokenisation fee  
- Platform fee  
- Data and advisory services  


## Roadmap

Current  
Live token minting  
Working backend and frontend  
HCS audit flow  

Next  
Wallet integration  
KYC / compliance  
Stablecoin rails  

Later  
Farm pilots  
Secondary market  
Advisor and lender integration  


## Founder

Colin Porter

Computer scientist with a background in distributed systems and Bitcoin.  
Focused on real-world asset tokenisation and practical infrastructure.


## Mission

Provide a usable financial tool for farmers to access liquidity while retaining ownership of their land.
