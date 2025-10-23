# Feature Specification: Base Network On-chain Logic, FastAPI Verification, Frontend & Payout

**Feature Branch**: `001-base-chain-fastapi-frontend`  
**Created**: 2025-10-23  
**Status**: Draft  
**Input**: User description: "链上逻辑基于 Base 网络； 2. 日本服务器负责实盘验证，使用 FastAPI； 3. 美国服务器负责前端与赔付； 4. 所有交易数据与证据需哈希化上链； 5. 仅保留 Merkle 根，不存原始交易数据。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - On-chain Logic on Base Network (Priority: P1)

The system's core on-chain logic operates on the Base network.

**Why this priority**: Fundamental architectural decision, impacts all subsequent development.

**Independent Test**: Verify smart contracts are deployed and functioning correctly on the Base network.

**Acceptance Scenarios**:

1. **Given** the system is deployed, **When** an on-chain transaction is initiated, **Then** it is processed on the Base network.

---

### User Story 2 - Real-time Verification via Japan Server (Priority: P1)

A server located in Japan is responsible for real-time verification using FastAPI.

**Why this priority**: Critical for data integrity and system reliability.

**Independent Test**: Simulate real-time data and verify the Japan server processes it correctly via FastAPI.

**Acceptance Scenarios**:

1. **Given** real-time transaction data is received, **When** the Japan server processes it, **Then** verification is performed using FastAPI.

---

### User Story 3 - Frontend and Payout via US Server (Priority: P1)

A server located in the US handles the frontend interface and payout logic.

**Why this priority**: Directly impacts user experience and core business function (payouts).

**Independent Test**: Access the frontend from a user perspective and trigger a payout scenario, verifying the US server handles both.

**Acceptance Scenarios**:

1. **Given** a user interacts with the frontend, **When** a payout is requested, **Then** the US server processes the request and initiates the payout.

---

### Edge Cases

- What happens when the Base network experiences congestion or downtime?
- How does the system handle discrepancies between real-time data and on-chain data during verification?
- What are the failover mechanisms if the Japan or US servers become unavailable?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST deploy and execute all core on-chain logic on the Base network.
- **FR-002**: System MUST utilize a server in Japan for real-time transaction verification.
- **FR-003**: The Japan server MUST implement verification logic using FastAPI.
- **FR-004**: System MUST utilize a server in the US for hosting the frontend interface.
- **FR-005**: System MUST utilize a server in the US for processing payout requests.
- **FR-006**: All transaction data and evidence MUST be hashed and recorded on-chain.
- **FR-007**: System MUST only store Merkle roots on-chain, without retaining original transaction data.

### Key Entities *(include if feature involves data)*

- **Transaction Data**: Raw data related to user transactions.
- **Evidence**: Supporting information for transactions.
- **Merkle Root**: Cryptographic hash representing a set of hashed transaction data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All core on-chain operations are successfully executed on the Base network with 99.9% uptime.
- **SC-002**: The Japan server successfully verifies 100% of real-time transactions within 500ms latency.
- **SC-003**: The US server successfully serves the frontend and processes 99.9% of payout requests without errors.
- **SC-004**: All transaction data and evidence are successfully hashed and recorded on-chain, with only Merkle roots stored, ensuring data privacy.
