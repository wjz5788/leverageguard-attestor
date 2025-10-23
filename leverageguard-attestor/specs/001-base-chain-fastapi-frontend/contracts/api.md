# API Contracts for Base Network On-chain Logic, FastAPI Verification, Frontend & Payout

This document outlines the API contracts for the various services.

## Japan Server - Verification API (FastAPI)

### `POST /verify`
- **Description**: Endpoint for real-time transaction verification.
- **Request Body**: 
    ```json
    {
      "transactionData": { /* ... transaction details ... */ },
      "evidence": { /* ... evidence details ... */ }
    }
    ```
- **Response Body**: 
    ```json
    {
      "verificationStatus": "success" | "failure",
      "message": "string"
    }
    ```

## US Server - Payout API

### `POST /payout`
- **Description**: Endpoint for processing payout requests.
- **Request Body**: 
    ```json
    {
      "userId": "string",
      "amount": "number",
      "currency": "string",
      "transactionId": "string" 
    }
    ```
- **Response Body**: 
    ```json
    {
      "payoutStatus": "initiated" | "failed",
      "payoutId": "string",
      "message": "string"
    }
    ```
