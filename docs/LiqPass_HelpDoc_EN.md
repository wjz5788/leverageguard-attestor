# LiqPass — Help Documentation for Base Ecosystem Fund (English Final)
**An insured gateway for retail leverage traders**  
**Base Ecosystem Fund Application Document**

**Project Information**
- Project: LiqPass
- Category: On-chain liquidation insurance
- Network: Base Mainnet
- Contract: `0x9552b58d323993f84d01e3744f175f47a9462f94`
- Repository: https://github.com/wjz5788/leverageguard-attestor
- Website: https://wjz5788.com
- Contact: zmshyc@gmail.com

---

## Project Overview
**LiqPass** provides retail traders with an insured gateway to high-leverage trading. Through a premium–payout model, risk-averse users can safely enter derivatives markets, expanding on-chain trading volume, increasing transaction fees, and attracting new users to the Base ecosystem.

---

## 1. Why These Exchanges
We integrate with **top centralized derivative exchanges** such as Binance, OKX, and Bybit. These exchanges have deep liquidity, standardized liquidation fields, and stable APIs—essential for standardized verification and reproducible results.

According to public data (CryptoRank, CoinMarketCap, CoinGecko, 1H 2025):
- **Binance Futures** ranks first globally by derivatives volume and open interest (OI);
- **OKX Futures** and **Bybit Futures** follow in the second tier with consistent API formats and stable data structures.

Based on this structure, **Binance / OKX / Bybit** are our first integrations to ensure stability, compatibility, and global coverage. The initial prototype uses **OKX** as the verification sample, with **Binance** and **Gate.io** to follow.

**References:**
- CryptoRank — Derivatives Exchanges Ranking
- CoinMarketCap — Derivatives Exchanges Rankings
- CoinGecko — Binance Futures Statistics

---

## 2. Why Users Connect Exchange Data
### Core Purpose
The sole purpose of connecting a read-only API is to **verify the authenticity of a liquidation event**. When a user submits an order ID, the system checks—via read-only API—whether it exists, matches the parameters (symbol, leverage, settlement), contains a liquidation flag (`LIQUIDATION` / `ADL`), and belongs to the user.

### Security and Minimal Authorization
- A user may hold multiple exchange accounts, but only **one** needs to be connected for LiqPass;
- All access is **read-only**, with no trading, withdrawal, or transfer rights;
- We recommend **separating the main account from high-leverage accounts** for safety;
- Examples:
  - If the main account trades on **OKX**, bind **Binance** as the insured account;
  - If mainly on **Binance**, bind **OKX**;
  - If active on both, use **Gate.io** or another small account.
- Multiple high-leverage positions can be opened within the chosen exchange—no need to bind multiple platforms;
- Data are accessed only when verifying claims—never continuously.

> In short: LiqPass follows **“minimal authorization + account isolation”**, verifying truth while protecting user assets.

---

## 3. Product and Claim Workflow
### Current Product
Fixed-payout protection based on trading principal and leverage multiplier. Premiums and payout limits are calculated automatically at purchase.

### Purchase Flow (Overview)
1. Connect wallet (e.g., MetaMask);
2. Select exchange and input read-only keys;
3. Enter principal and leverage;
4. System calculates premium and payout;
5. Policy activates after payment.

### Claim Process (Passive)
LiqPass uses a **passive claim model**, without monitoring trades. After liquidation, the user submits an order ID or JSON; a local verification checks the order against the policy. If matched, payout is triggered; otherwise, screenshots or additional materials can be submitted for manual review.

Currently we use **offline local verification + Merkle-root attestation**. U.S.-based servers cannot reliably reach OKX/Binance APIs; only hashed summaries (Merkle Roots) are written on-chain for public auditability.

---

## 4. Data and Privacy
- Client-side encryption; ciphertext-only storage;
- No full trading history retained—only verification summaries;
- Post-claim, a **Merkle Root** is committed on-chain;
- Users can unbind and delete bindings at any time;
- On-chain records contain no personally identifiable data.

---

## 5. Pricing and Risk Control
### Pricing Principle
Premiums are derived from an internal model combining **risk probability, payout limit, and operating cost**, ensuring sustainable, fair, and auditable reserves.

### Risk and Anti-Fraud
- Waiting periods and payout caps deter arbitrage;
- Duplicate/anomalous accounts detection;
- Blacklist and manual overrides safeguard the pool.

---

## 6. Contact
- Email: zmshyc@gmail.com
- Website: https://wjz5788.com
- Repo: https://github.com/wjz5788/leverageguard-attestor
- Base Mainnet Contract: `0x9552b58d323993f84d01e3744f175f47a9462f94`

*This is the Base Ecosystem Fund application edition; production release may differ.*