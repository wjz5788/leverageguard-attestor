# Tasks: Base Network On-chain Logic, FastAPI Verification, Frontend & Payout

**Input**: Design documents from `/specs/001-base-chain-fastapi-frontend/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan in `/Users/zhaomosheng/Desktop/100x/leverageguard-attestor/`
- [ ] T002 Initialize Python 3.10+ project with FastAPI dependencies in `backend-japan/`
- [ ] T003 Initialize Python 3.10+ project with FastAPI dependencies in `backend-us/`
- [ ] T004 Initialize JavaScript/TypeScript (Node.js 18+) project with frontend dependencies in `frontend/`
- [ ] T005 Initialize Solidity 0.8.x project with Foundry dependencies in `contracts/`
- [ ] T006 [P] Configure linting and formatting tools for Python, JavaScript/TypeScript, and Solidity.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Setup PostgreSQL database schema and migrations framework for `backend-japan/`
- [ ] T008 Setup PostgreSQL database schema and migrations framework for `backend-us/`
- [ ] T009 [P] Setup API routing and middleware structure for `backend-japan/src/api/`
- [ ] T010 [P] Setup API routing and middleware structure for `backend-us/src/api/`
- [ ] T011 Create base models/entities (Transaction Data, Evidence, Merkle Root) that all stories depend on in `backend-japan/src/verification/models.py` and `backend-us/src/payout/models.py`
- [ ] T012 Configure error handling and logging infrastructure for `backend-japan/`
- [ ] T013 Configure error handling and logging infrastructure for `backend-us/`
- [ ] T014 Setup environment configuration management for `backend-japan/` and `backend-us/`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - On-chain Logic on Base Network (Priority: P1) 🎯 MVP

**Goal**: The system's core on-chain logic operates on the Base network.

**Independent Test**: Verify smart contracts are deployed and functioning correctly on the Base network.

### Implementation for User Story 1

- [ ] T015 [US1] Implement `BaseLogic.sol` smart contract in `contracts/src/BaseLogic.sol`
- [ ] T016 [US1] Develop deployment script for `BaseLogic.sol` to Base network in `contracts/scripts/`
- [ ] T017 [US1] Implement on-chain hashing and Merkle root generation logic within `BaseLogic.sol`
- [ ] T018 [US1] Add unit tests for `BaseLogic.sol` in `contracts/tests/`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Real-time Verification via Japan Server (Priority: P1)

**Goal**: A server located in Japan is responsible for real-time verification using FastAPI.

**Independent Test**: Simulate real-time data and verify the Japan server processes it correctly via FastAPI.

### Implementation for User Story 2

- [ ] T019 [P] [US2] Create `Transaction Data` and `Evidence` models in `backend-japan/src/verification/models.py`
- [ ] T020 [US2] Implement `POST /verify` API endpoint in `backend-japan/src/api/`
- [ ] T021 [US2] Implement real-time verification logic in `backend-japan/src/verification/`
- [ ] T022 [US2] Integrate with on-chain Merkle root verification (calling `BaseLogic.sol`)
- [ ] T023 [US2] Add unit tests for verification logic in `backend-japan/tests/`
- [ ] T024 [US2] Add integration tests for `POST /verify` endpoint in `backend-japan/tests/`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Frontend and Payout via US Server (Priority: P1)

**Goal**: A server located in the US handles the frontend interface and payout logic.

**Independent Test**: Access the frontend from a user perspective and trigger a payout scenario, verifying the US server handles both.

### Implementation for User Story 3

- [ ] T025 [P] [US3] Create `Transaction Data` and `Merkle Root` models in `backend-us/src/payout/models.py`
- [ ] T026 [US3] Implement `POST /payout` API endpoint in `backend-us/src/api/`
- [ ] T027 [US3] Implement payout processing logic in `backend-us/src/payout/`
- [ ] T028 [US3] Develop frontend components for user interaction and payout requests in `frontend/src/components/`
- [ ] T029 [US3] Develop frontend pages for displaying transaction status and initiating payouts in `frontend/src/pages/`
- [ ] T030 [US3] Integrate frontend with `backend-us` payout API
- [ ] T031 [US3] Add unit tests for payout logic in `backend-us/tests/`
- [ ] T032 [US3] Add integration tests for `POST /payout` endpoint in `backend-us/tests/`
- [ ] T033 [US3] Add end-to-end tests for frontend user journey in `frontend/tests/`

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T034 [P] Documentation updates in `docs/` (e.g., `quickstart.md`)
- [ ] T035 Code cleanup and refactoring across all services
- [ ] T036 Performance optimization across all stories (e.g., API response times, smart contract gas usage)
- [ ] T037 Security hardening for all services and smart contracts
- [ ] T038 Run `quickstart.md` validation and update as needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
