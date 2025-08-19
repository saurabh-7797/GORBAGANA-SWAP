const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("8qhCTESZN9xDCHvtXFdCHfsgcctudbYdzdCFzUkTTMMe");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

// Tokens
const TOKEN_A_MINT = new PublicKey("4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P");
const TOKEN_B_MINT = new PublicKey("AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH");
const TOKEN_C_MINT = new PublicKey("EnpmunfM7kxxgLSJXd3ZG5jaJShMqJF9so95NcXJv1UW");

// Pool 1 (A-B) - From successful initialization
const POOL1_VAULT_A = new PublicKey("6mZhTti941V2HURaYUHtdAMQeM4oRQNozUpaiv9eNXQf");
const POOL1_VAULT_B = new PublicKey("6H3yozauFzxWcuLYgDy8eTnTc83C7vCBYeHDjQYiwMpF");

// Pool 2 (B-C) - From successful initialization  
const POOL2_VAULT_B = new PublicKey("FTMqVxLRMpCpSPaUAHNKgSFmq6BoEULbb6QfYkPNhMCE");
const POOL2_VAULT_C = new PublicKey("Ei2eeRY1X8hG9VJ6PVyT7mcLUPcXUEa4uJqoA5LACW85");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to get token balance with retry
async function getTokenBalance(tokenAccount, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const account = await getAccount(connection, tokenAccount, "confirmed", SPL_TOKEN_PROGRAM_ID);
      return Number(account.amount);
    } catch (error) {
      console.log(`Balance check attempt ${i + 1} failed, retrying...`);
      if (i === retries - 1) {
        console.log(`Failed to get balance after ${retries} attempts`);
        return 0;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Helper function to format token amounts
function formatTokenAmount(amount, decimals = 9) {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

async function main() {
  try {
    console.log("🚀 Starting Multihop Swap: A → B → C");
    console.log(`Route: Token A → Token B → Token C`);
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`Token C: ${TOKEN_C_MINT.toString()}`);

    // 1. Derive pool PDAs
    const [pool1PDA] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    const [pool2PDA] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_B_MINT.toBuffer(), TOKEN_C_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    
    console.log(`Pool 1 (A-B): ${pool1PDA.toString()}`);
    console.log(`Pool 2 (B-C): ${pool2PDA.toString()}`);

    // 2. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenC = getAssociatedTokenAddressSync(TOKEN_C_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User Token B ATA: ${userTokenB.toString()}`);
    console.log(`User Token C ATA: ${userTokenC.toString()}`);

    // 3. Check balances before swap
    console.log("\n📊 Balances BEFORE Multihop Swap:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const balanceTokenCBefore = await getTokenBalance(userTokenC);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`Token C: ${formatTokenAmount(balanceTokenCBefore)} (${balanceTokenCBefore} raw)`);

    // 4. Multihop swap parameters
    const amountIn = 500_000_000; // 0.5 Token A
    const minimumAmountOut = 100_000_000; // 0.1 Token C (slippage protection)
    
    console.log(`\n🔄 Multihop Swap Parameters:`);
    console.log(`Input: ${formatTokenAmount(amountIn)} Token A`);
    console.log(`Minimum Output: ${formatTokenAmount(minimumAmountOut)} Token C`);
    console.log(`Route: A → B → C (2 hops)`);
    console.log(`Expected Fees: ~0.6% total (0.3% per hop)`);

    // 5. Create intermediate Token B account for the swap route
    // This account will temporarily hold Token B between the two hops
    const intermediateTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

    // 6. Prepare accounts for MultihopSwap
    // Account structure: [user, token_program, user_input_account, ...hop_accounts]
    // Each hop: [pool, token_a, token_b, vault_a, vault_b, intermediate_account, output_account]
    const accounts = [
      // User and program accounts
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: userTokenA, isSigner: false, isWritable: true }, // Initial input
      
      // Hop 1: A → B
      { pubkey: pool1PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: POOL1_VAULT_A, isSigner: false, isWritable: true },
      { pubkey: POOL1_VAULT_B, isSigner: false, isWritable: true },
      { pubkey: intermediateTokenB, isSigner: false, isWritable: true }, // Intermediate B
      { pubkey: intermediateTokenB, isSigner: false, isWritable: true }, // Output for hop 1
      
      // Hop 2: B → C  
      { pubkey: pool2PDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_C_MINT, isSigner: false, isWritable: false },
      { pubkey: POOL2_VAULT_B, isSigner: false, isWritable: true },
      { pubkey: POOL2_VAULT_C, isSigner: false, isWritable: true },
      { pubkey: intermediateTokenB, isSigner: false, isWritable: true }, // Input for hop 2  
      { pubkey: userTokenC, isSigner: false, isWritable: true }, // Final output
    ];

    // 7. Instruction data (Borsh: MultihopSwap { amount_in, minimum_amount_out })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(4, 0); // MultihopSwap discriminator
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeBigUInt64LE(BigInt(minimumAmountOut), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 8. Create transaction
    const tx = new Transaction();

    // Add MultihopSwap instruction
    console.log("📝 Adding MultihopSwap instruction...");
    
    tx.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("📤 Sending multihop swap transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    
    console.log("✅ Multihop Swap transaction successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // 9. Check balances after swap
    console.log("\n📊 Balances AFTER Multihop Swap:");
    console.log("Waiting 2 seconds for transaction to settle...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceTokenCAfter = await getTokenBalance(userTokenC);
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`Token C: ${formatTokenAmount(balanceTokenCAfter)} (${balanceTokenCAfter} raw)`);

    // 10. Calculate swap results
    const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
    const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
    const tokenCChange = balanceTokenCAfter - balanceTokenCBefore;
    
    console.log("\n🔄 Multihop Swap Results:");
    console.log(`Token A Change: ${formatTokenAmount(tokenAChange)} (${tokenAChange} raw)`);
    console.log(`Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange} raw)`);
    console.log(`Token C Change: ${formatTokenAmount(tokenCChange)} (${tokenCChange} raw)`);

    console.log(`\n💰 Multihop Summary:`);
    console.log(`Route: Token A → Token B → Token C`);
    console.log(`Input: ${formatTokenAmount(-tokenAChange)} Token A`);
    console.log(`Output: ${formatTokenAmount(tokenCChange)} Token C`);
    console.log(`Exchange Rate: 1 Token A = ${(tokenCChange / -tokenAChange).toFixed(6)} Token C`);
    console.log(`Total Hops: 2`);
    console.log(`Pools Used: A-B, B-C`);
    
    // Calculate approximate fees (0.3% per hop)
    const expectedOutput = amountIn * 0.997 * 0.997; // Two 0.3% fees
    const actualOutput = tokenCChange;
    const feeEffect = ((expectedOutput - actualOutput) / amountIn * 100).toFixed(3);
    console.log(`Approximate Fee Impact: ${feeEffect}%`);
    
  } catch (error) {
    console.error("❌ Error in Multihop Swap:", error.message);
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log, index) => {
        console.error(`  ${index + 1}: ${log}`);
      });
    }
    throw error;
  }
}

main().catch(console.error); 