# Implementation Plan: Base Network On-chain Logic, FastAPI Verification, Frontend & Payout

**Branch**: `001-base-chain-fastapi-frontend` | **Date**: 2025-10-23 | **Spec**: specs/001-base-chain-fastapi-frontend/spec.md
**Input**: Feature specification from `/specs/001-base-chain-fastapi-frontend/spec.md`

## Summary
The project involves on-chain logic on the Base network, real-time verification via a Japan server using FastAPI, and frontend/payout processing via a US server. All transaction data and evidence will be hashed and recorded on-chain, retaining only Merkle roots for privacy.

## Technical Context

**Language/Version**: Python 3.10+ (for FastAPI), JavaScript/TypeScript (Node.js 18+ for Frontend), Solidity 0.8.x (for Smart Contracts).
**Primary Dependencies**: FastAPI, Node.js, Foundry.
**Storage**: On-chain (Base network for Merkle roots), PostgreSQL (for server-side operations).
**Testing**: Foundry (for smart contracts), pytest (for FastAPI), Jest/React Testing Library (for Frontend).
**Target Platform**: Base Mainnet (on-chain), Linux servers (Japan/US), Web browsers (Frontend).
**Performance Goals**: 
- On-chain operations: Efficient gas usage, timely transaction finality.
- Japan server: 100% real-time transaction verification within 500ms latency.
- US server: 99.9% frontend availability, 99.9% payout request processing without errors.
**Constraints**: 
- Data privacy: Only Merkle roots stored on-chain, no raw transaction data.
- Geographical distribution: Japan server for verification, US server for frontend/payout.
- Base network dependency.
**Scale/Scope**: Global user base for frontend, high volume of transactions for verification and on-chain recording.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Branch Management**: Planned branch strategy aligns with `main` stability, feature branches, and hotfix branches.
- [x] **II. Commit Convention**: Commit messages will follow the `type(scope): summary` format.
- [x] **III. Sensitive Information Handling**: Measures will be in place to prevent committing sensitive information and to use secure handling practices.
- [x] **IV. CI/Testing**: Appropriate CI/testing will be implemented for smart contracts (Foundry) and frontend (Node 20), leveraging `.github/workflows/ci.yml`.
- [x] **V. Documentation & Readme**: Comprehensive `README.md` files and operational instructions will be provided for new components within `src/`.

## Project Structure

```text
backend-japan/
├── src/
│   ├── verification/
│   └── api/
└── tests/

backend-us/
├── src/
│   ├── payout/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

contracts/
├── src/
│   └── BaseLogic.sol
└── tests/
```

**Structure Decision**: The project will adopt a distributed backend architecture with separate services for Japan (verification) and US (payout), alongside a dedicated frontend. Smart contracts will reside in their own `contracts/` directory.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
