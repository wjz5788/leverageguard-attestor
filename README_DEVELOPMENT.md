# LiqPass - Liquidation Insurance Platform

LiqPass is an on-chain liquidation insurance platform that provides protection for leveraged traders against liquidation risks on centralized exchanges.

## Project Structure

This is a monorepo containing both frontend and backend applications:

- `packages/us-frontend/` - React frontend application
- `packages/us-backend/` - Node.js/Express backend API
- `contracts/` - Smart contracts for insurance payouts

## Prerequisites

- Node.js 20.x or higher
- npm or yarn package manager

## Quick Start

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd 100x
   ```

2. Run the development startup script:
   ```bash
   ./start-dev.sh
   ```
   
   This will:
   - Install dependencies for both frontend and backend
   - Create a backend environment file if it doesn't exist
   - Start both servers in development mode

3. Open your browser and navigate to:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

## Manual Setup

If you prefer to set up the project manually:

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd packages/us-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.us.example .env.us
   ```

4. Edit the `.env.us` file with your configuration

5. Start the backend server:
   ```bash
   npm run dev
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd packages/us-frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the frontend server:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /healthz` - Health check endpoint
- `GET /catalog/skus` - Get available insurance plans
- `POST /orders` - Create a new insurance order
- `POST /claim` - Submit a liquidation claim
- `POST /admin/payout` - Process a claim payout (admin only)

## Environment Variables

### Backend (.env.us)

- `US_PORT` - Backend server port (default: 3001)
- `DB_PATH` - Path to SQLite database file
- `LOG_PATH` - Path to log file
- `ALLOW_ORIGIN` - CORS allowed origin
- `PAYOUT_MODE` - Payout mode: 'simulate' or 'real'
- `DEFAULT_PAYOUT_ADDRESS` - Default payout address for simulations
- `PAYOUT_PRIVATE_KEY` - Private key for real payouts (production only)
- `BASE_RPC_URL` - Base network RPC URL
- `CONTRACT_ADDRESS` - Insurance contract address

## Database

The application uses SQLite as the database. The database schema is defined in `scripts/migrate.sql` and includes tables for:

- `orders` - Insurance orders
- `claims` - Liquidation claims
- `idempotency_keys` - Request idempotency
- `logs` - Application logs

## Smart Contracts

The smart contracts are located in the `contracts/` directory. They handle the insurance payouts on the blockchain.

## Development

### Frontend

The frontend is built with React, TypeScript, and Tailwind CSS. It uses Vite as the build tool.

### Backend

The backend is built with Node.js, Express, and SQLite. It includes:

- RESTful API with proper error handling
- Request idempotency
- Transaction management
- Logging
- Blockchain integration for payouts

## Production Deployment

For production deployment:

1. Set up proper environment variables
2. Configure a production database
3. Set up proper CORS origins
4. Configure blockchain credentials
5. Build the frontend: `cd packages/us-frontend && npm run build`
6. Run the backend: `cd packages/us-backend && npm start`

## License

This project is licensed under the MIT License.