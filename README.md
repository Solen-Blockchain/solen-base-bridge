# Solen <> Base Bridge

Lock-and-mint bridge between the Solen network and Base chain (Ethereum L2).

- **Solen → Base**: Lock SOLEN in the bridge vault, relayer mints wSOLEN (ERC-20) on Base
- **Base → Solen**: Burn wSOLEN on Base, relayer releases native SOLEN from the vault

## Architecture

```
Solen Network                          Base Chain
┌─────────────┐                    ┌─────────────────┐
│ Bridge       │  ── deposit ──>   │ SolenBridge.sol  │
│ System       │                   │   relayDeposit() │
│ Contract     │                   │   → mint wSOLEN  │
│              │  <── release ──   │                   │
│ bridge_from_ │                   │ bridgeToSolen()  │
│ base()       │                   │   → burn wSOLEN  │
└─────────────┘                    └─────────────────┘
        ↑                                  ↑
        └──────── Relayer Service ─────────┘
```

## Deployed Contracts (Base Sepolia Testnet)

| Contract | Address |
|----------|---------|
| WrappedSOLEN (wSOLEN) | `0x2774FF63879Ae11CC6763538Ec1133d2907fCe8F` |
| SolenBridge | `0x114E53baa3A49A3D1F28DCaBdF27EF13EF19bbAD` |

## Setup

### 1. Install dependencies

```bash
npm install
cd relayer && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your keys
```

Required env vars:
- `DEPLOYER_PRIVATE_KEY` — Base chain deployer/relayer private key
- `BASE_SEPOLIA_RPC` — Base Sepolia RPC URL
- `SOLEN_SEQUENCER_SEED` — Solen sequencer ed25519 seed (hex, for automated releases)

### 3. Compile contracts

```bash
npx hardhat compile
```

### 4. Deploy (if needed)

```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

### 5. Run the relayer

```bash
cd relayer
npm start
```

## Bridge UI

The bridge UI is at `solenchain.io/bridge.html`. It connects to both Solen Wallet (Chrome extension) and MetaMask for dual-chain bridging.

## CLI Usage (Solen side)

```bash
# Bridge SOLEN to Base
solen bridge-to-base <from-key> <0xBaseAddress> <amount>

# Example
solen --network testnet bridge-to-base mykey 0x082FC99040BEA444C823b29B3C67df9e18C03672 100
```

## Security Features

- **Replay protection**: Each deposit/release has a unique hash tracked on both chains
- **Daily volume cap**: Configurable limit on bridge throughput
- **Timelock**: Large withdrawals can have a delay period
- **Pause**: Bridge can be paused in emergencies
- **Relayer authorization**: Only whitelisted addresses can relay deposits

## Contract Details

### WrappedSOLEN (wSOLEN)
- ERC-20 with 8 decimals (matches Solen native precision)
- Mint/burn controlled exclusively by the bridge contract
- Audit trail: `totalMinted` and `totalBurned` counters

### SolenBridge
- `relayDeposit()` — Relayer mints wSOLEN after Solen deposit
- `bridgeToSolen()` — User burns wSOLEN to bridge back
- `bridgeStats()` — View total supply, daily volume, pause status
