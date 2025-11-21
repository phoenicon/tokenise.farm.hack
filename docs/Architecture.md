# Tokenise.Farm – Architecture

```text
                         TOKENISE.FARM — ARCHITECTURE

                         ┌────────────────────────────┐
                         │        Frontend UI         │
                         │  React + TS + Tailwind     │
                         │  (Lovable-generated app)   │
                         └──────────────┬─────────────┘
                                        │  JSON/REST
                     http://localhost:4000/api/*
                                        │
                                        ▼
                         ┌────────────────────────────┐
                         │       Backend Server       │
                         │   Node.js + Express API    │
                         ├────────────────────────────┤
                         │  POST /api/farms           │
                         │  POST /api/farms/:id/tokenise
                         │  GET  /api/farms           │
                         │  GET  /health              │
                         └───────┬────────────────────┘
                                 │ Hedera JS SDK Calls
                                 │
                                 ▼
                  ┌────────────────────────────────────────┐
                  │              Hedera Network             │
                  │────────────────────────────────────────│
                  │  HTS (Hedera Token Service)            │
                  │    • Create fungible farm tokens       │
                  │    • Fixed supply = 25% of land value  │
                  │                                        │
                  │  HCS (Consensus Service)*              │
                  │    • Immutable logs of farm events     │
                  │    • Auditable trail (future phase)    │
                  └────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────┐
                    │   On-Chain Token Metadata  │
                    │   Token IDs, supply, hash  │
                    └────────────────────────────┘


* Phase 2: add notarisation + event logs for regulators and lenders.
