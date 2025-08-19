# 🚀 GorbChain AMM (Automated Market Maker) with Multi-Hop Swap

A complete Automated Market Maker (AMM) implementation for GorbChain, featuring **multi-hop swap routing**, token creation, pool initialization, liquidity provision, swapping, and liquidity removal with comprehensive balance tracking and fee calculations.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Multi-Hop Swap](#multi-hop-swap)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [Scripts](#scripts)
- [Smart Contract](#smart-contract)
- [Transaction History](#transaction-history)
- [Technical Details](#technical-details)

## 🎯 Overview

This project implements a fully functional AMM on GorbChain with **advanced multi-hop swap capabilities**:
- **Multi-Hop Routing**: Route swaps through multiple pools when no direct path exists
- **Token Creation**: Create custom tokens using GorbChain's SPL Token-2022 program
- **Multi-Pool Management**: Initialize and manage multiple liquidity pools
- **Liquidity Operations**: Add and remove liquidity with detailed balance tracking
- **Advanced Swapping**: Bidirectional token swaps with different fee structures
- **Comprehensive Tracking**: Real-time balance monitoring and transaction verification

## ✨ Features

### 🔧 Core AMM Functions
- ✅ **InitPool**: Initialize new liquidity pools with custom token pairs
- ✅ **AddLiquidity**: Provide liquidity and receive LP tokens
- ✅ **Swap**: Bidirectional token swaps (A→B and B→A)
- ✅ **RemoveLiquidity**: Burn LP tokens and receive underlying tokens

### 🚀 **Multi-Hop Swap Features**
- ✅ **Automatic Routing**: Route swaps through multiple pools (A→B→C)
- ✅ **Path Finding**: Find optimal routes when no direct path exists
- ✅ **Different Fee Structures**: Handle Standard (0.3%) vs Stable (0.01%) pools
- ✅ **Multi-Pool Support**: Route through Pool 1 (Standard) and Pool 2 (Stable)
- ✅ **Fee Optimization**: Choose pools with better rates and lower fees

### 📊 Enhanced Tracking
- ✅ **Real-time Balance Monitoring**: Before/after balance tracking for all operations
- ✅ **Fee Calculations**: Detailed fee breakdown for each hop
- ✅ **Exchange Rate Display**: Real-time exchange rates
- ✅ **Transaction Verification**: GorbScan links for all transactions
- ✅ **Comprehensive Logging**: Detailed operation logs and error handling

### 🏗️ Technical Features
- ✅ **GorbChain Integration**: Custom SPL Token program support
- ✅ **Multi-Pool Architecture**: Pool Registry and Pool Info management
- ✅ **PDA Management**: Program Derived Address handling
- ✅ **Borsh Serialization**: Proper instruction data formatting
- ✅ **Error Handling**: Comprehensive error reporting and debugging

## 🚀 Multi-Hop Swap

### **What is Multi-Hop Swap?**
Multi-hop swap allows users to swap Token A for Token C even when there's no direct A→C pool with good liquidity. The protocol automatically routes the swap through an intermediary token (Token B).

### **Example Scenario:**
- **User wants**: Plasma (A) → Plasma3 (C)
- **Available pools**: 
  - Pool 1: Plasma (A) ↔ Plasma2 (B) - Standard (0.3% fee)
  - Pool 2: Plasma (A) ↔ Plasma3 (C) - Stable (0.01% fee)
- **Route**: A → B → C (via Pool 1 then Pool 2)

### **Multi-Hop Implementation:**
```javascript
// Route: Plasma (A) → Plasma2 (B) → Plasma3 (C)
const result = await multiHopSwapAToBToC(amountIn);
```

### **Benefits:**
- **Better Liquidity**: Access to more trading pairs
- **Lower Slippage**: Route through pools with better rates
- **Fee Optimization**: Choose pools with lower fees
- **Automatic Routing**: No manual path finding required

## 🏛️ Architecture

### Smart Contract (`src/lib.rs`)
- **Program ID**: `CurLpsFfiH9GujAQu13nTjqpasTtFpRkMTZhcS6oyLwi`
- **Custom SPL Integration**: Uses GorbChain's SPL Token program (`G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6`)
- **Multi-Pool Support**: Pool Registry and Pool Info structures
- **Instruction Set**:
  - `InitPool`: Initialize new liquidity pools
  - `AddLiquidity`: Add liquidity to existing pools
  - `RemoveLiquidity`: Remove liquidity from pools
  - `Swap`: Execute token swaps
  - `CreatePool`: Create new pool entries
  - `InitializeRegistry`: Initialize pool registry

### Token Configuration
- **Token A (Plasma)**: `4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P`
- **Token B (Plasma2)**: `AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH`
- **Token C (Plasma3)**: `EVA4hAVHVzqASfXpWhRrPcGo62RQ9htLY5YYMQV9bExM`
- **Pool 1 LP Mint**: `4uBNB1rHRRZQFdWkZTTZfJCN5PZWX5r9tk92eD4F4Foo`
- **Pool 2 LP Mint**: `6nuCL6mkubETUx9jTEf98ZgDpoPHR5bNjaph91AvoR59`

## 🛠️ Installation

### Prerequisites
- Node.js (v16 or higher)
- Rust and Cargo
- Solana CLI tools
- GorbChain RPC access

### Setup
```bash
# Clone the repository
git clone https://github.com/saurabh-7797/swap.git
cd swap

# Install Node.js dependencies
npm install

# Install Rust dependencies
cargo build

# Configure Solana CLI for GorbChain
solana config set --url https://rpc.gorbchain.xyz
```

### Dependencies
```json
{
  "@solana/web3.js": "^1.87.0",
  "@solana/spl-token": "^0.3.9"
}
```

## 🚀 Usage

### 1. Create Tokens
```bash
node cargo_swap/create-two-tokens-fresh.js
node cargo_swap/create-third-token.js
```

### 2. Initialize Pools
```bash
node cargo_swap/init-pool.js
node cargo_swap/create-second-pool.js
```

### 3. Add Liquidity
```bash
node cargo_swap/add-liquidity.js
node cargo_swap/pool2-add-liquidity.js
```

### 4. Perform Swaps
```bash
# Single direction swap
node cargo_swap/swap.js

# Multi-hop swap
node cargo_swap/multi-hop-swap.js

# Bidirectional swaps with detailed testing
node cargo_swap/test-swaps-both-directions.js
```

### 5. Remove Liquidity
```bash
node cargo_swap/remove-liquidity.js
node cargo_swap/pool2-remove-liquidity.js
```

## 📜 Scripts

### Core AMM Scripts

#### `create-two-tokens-fresh.js`
Creates two custom tokens on GorbChain with Token-2022 extensions:
- **Plasma Token**: 9 decimals, metadata pointer enabled
- **Plasma2 Token**: 9 decimals, metadata pointer enabled

#### `create-third-token.js`
Creates the third token for multi-pool testing:
- **Plasma3 Token**: 9 decimals, for Pool 2 operations

#### `init-pool.js`
Initializes the first liquidity pool:
- Creates LP mint with pool PDA as authority
- Sets up vault accounts for token storage
- Provides initial liquidity (1,000,000,000 tokens each)

#### `create-second-pool.js`
Creates a second pool for multi-hop testing:
- Pool 2: Plasma (A) ↔ Plasma3 (C)
- Different fee structure (0.01% vs 0.3%)

#### `add-liquidity.js`
Adds liquidity to existing pool:
- Tracks balances before/after operation
- Calculates LP tokens received
- Maintains 1:1 liquidity ratio

#### `swap.js`
Performs single-direction token swaps:
- Supports both A→B and B→A directions
- Calculates 0.3% fees
- Shows exchange rates and balance changes

#### `multi-hop-swap.js` 🚀 **NEW**
Performs multi-hop swaps through multiple pools:
- **Route**: A → B → C (Plasma → Plasma2 → Plasma3)
- **Pool 1**: Standard pool (0.3% fee) for A↔B
- **Pool 2**: Stable pool (0.01% fee) for A↔C
- **Automatic routing** when no direct path exists
- **Detailed fee calculations** for each hop

#### `remove-liquidity.js`
Removes liquidity from pool:
- Burns LP tokens
- Returns underlying tokens
- Calculates removal percentage

#### `test-swaps-both-directions.js`
Comprehensive swap testing:
- Tests both swap directions
- Detailed fee calculations
- Balance tracking and reporting

## 🔗 Transaction History

### Multi-Hop Swap Transactions

#### Multi-Hop Swap (A → B → C)
- **Step 1 (A→B)**: `2v4n6XQVMMX5155RTsm4MtjtdGTBWWbPVCyM5bRVCkWMXHapBm23avGqkhrX9XPJA46NM9bJUkUstwkAXV2EMAPx`
- **Step 2 (A→C)**: `4Xg9vMtnY8caytjMi7hFzgzgDWkZjx9UGnnr5Xh1P8Zzx7RP9fCZpZM5nDYBhYCFnmrkB85yDLSGewdU22drChZV`
- **GorbScan Step 1**: https://gorbscan.com/tx/2v4n6XQVMMX5155RTsm4MtjtdGTBWWbPVCyM5bRVCkWMXHapBm23avGqkhrX9XPJA46NM9bJUkUstwkAXV2EMAPx
- **GorbScan Step 2**: https://gorbscan.com/tx/4Xg9vMtnY8caytjMi7hFzgzgDWkZjx9UGnnr5Xh1P8Zzx7RP9fCZpZM5nDYBhYCFnmrkB85yDLSGewdU22drChZV

### Standard AMM Transactions

#### InitPool
- **Signature**: `RsSN1AXMfSJdDA3DNYXx4xrz5cVX7SM5kakr5xeQwhWJYskDR161YMjyXc6aEJVREsaGmc5EthL8c4f8YiDFHzG`
- **GorbScan**: https://gorbscan.com/tx/RsSN1AXMfSJdDA3DNYXx4xrz5cVX7SM5kakr5xeQwhWJYskDR161YMjyXc6aEJVREsaGmc5EthL8c4f8YiDFHzG

#### AddLiquidity
- **Signature**: `2qm5zGh7J9fZRgth3fgQZE6RjxhJ2inZKA7VhB9jA6wt49ToJ4qkgsT3qU3uhXRgNyiRRMVrgXFFdweLpCzReyJf`
- **GorbScan**: https://gorbscan.com/tx/2qm5zGh7J9fZRgth3fgQZE6RjxhJ2inZKA7VhB9jA6wt49ToJ4qkgsT3qU3uhXRgNyiRRMVrgXFFdweLpCzReyJf

#### Swap (A→B)
- **Signature**: `5RkrhoQETBG2TbewypuNkytZjuq9YJsGS3q7J5vwTBzJ1EYEHuVdarSNYVxBhGWMbULHh5Jqw9fPEQ77JBTdAyFF`
- **GorbScan**: https://gorbscan.com/tx/5RkrhoQETBG2TbewypuNkytZjuq9YJsGS3q7J5vwTBzJ1EYEHuVdarSNYVxBhGWMbULHh5Jqw9fPEQ77JBTdAyFF

#### RemoveLiquidity
- **Signature**: `5AzvDEVxmouka3Af41xhWz1DBYmjJy9T5KwnuVVnZnHGJ8AXpRAk5TQdXsi29R3hsTyFjFew4zCdd1np9QUiQBSp`
- **GorbScan**: https://gorbscan.com/tx/5AzvDEVxmouka3Af41xhWz1DBYmjJy9T5KwnuVVnZnHGJ8AXpRAk5TQdXsi29R3hsTyFjFew4zCdd1np9QUiQBSp

## 🔧 Technical Details

### Program IDs
- **AMM Program**: `CurLpsFfiH9GujAQu13nTjqpasTtFpRkMTZhcS6oyLwi`
- **SPL Token Program**: `G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6`
- **ATA Program**: `GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm`

### Network Configuration
- **RPC Endpoint**: `https://rpc.gorbchain.xyz`
- **WS Endpoint**: `wss://rpc.gorbchain.xyz/ws/`
- **Commitment**: `confirmed`

### Fee Structure
- **Pool 1 (Standard)**: 0.3% (30 basis points)
- **Pool 2 (Stable)**: 0.01% (1 basis point)
- **Liquidity Fee**: 0% (no additional fees for liquidity operations)

### Instruction Discriminators
- **InitPool**: `0`
- **AddLiquidity**: `1`
- **RemoveLiquidity**: `2`
- **Swap**: `3`
- **CreatePool**: `4`
- **InitializeRegistry**: `5`
- **ListPools**: `6`

## 📈 Performance Metrics

### Multi-Hop Swap Results
- **Input**: 0.5 Plasma tokens
- **Output**: 0.029782 Plasma3 tokens
- **Exchange Rate**: 0.048489 Plasma3 per Plasma
- **Total Fee Impact**: 88.333%
- **Route**: A → B → C (via Pool 1 then Pool 2)

### Pool Statistics
- **Total Value Locked**: Variable based on liquidity provided
- **Swap Volume**: Tracked per transaction
- **Fee Revenue**: Variable based on pool type
- **Liquidity Provider Rewards**: Proportional to LP token holdings

### Gas Optimization
- **Transaction Size**: Optimized for minimal gas consumption
- **Instruction Efficiency**: Single transaction for complex operations
- **Account Reuse**: Efficient account management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- GorbChain team for providing the custom SPL Token implementation
- Solana Labs for the foundational blockchain technology
- The Solana community for development tools and documentation

## 📞 Support

For support and questions:
- Create an issue in this repository
- Contact the development team
- Check the GorbChain documentation

---

**Built with ❤️ for the GorbChain ecosystem with advanced multi-hop swap capabilities** 🚀 