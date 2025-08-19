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
const TOKEN_A_MINT = new PublicKey("4nUfaDDYBfBaCovmnci5hZdbBe5gazRt8SSczmeMJ51P");
const TOKEN_B_MINT = new PublicKey("AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH");
const LP_MINT = new PublicKey("Bsb26ojJdPGHQ97HokmZAMuwDkK5RRVwtyW1VBUJrQNy");

const USER_KEYPAIR_PATH = "/home/saurabh/.config/solana/id.json";
const userKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf-8")))
);

const connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Helper function to get token balance
async function getTokenBalance(tokenAccount) {
  try {
    const account = await getAccount(connection, tokenAccount, "confirmed", SPL_TOKEN_PROGRAM_ID);
    return Number(account.amount);
  } catch (error) {
    return 0;
  }
}

// Helper function to format token amounts
function formatTokenAmount(amount, decimals = 9) {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

// Global fee tracking variables
let totalFeesTokenA = 0;
let totalFeesTokenB = 0;
let totalFeesToken = 0;

// Function to perform a swap
async function performSwap(directionAtoB, amountIn) {
  console.log(`\n🔄 Performing ${directionAtoB ? 'A → B' : 'B → A'} Swap...`);
  console.log(`Amount In: ${formatTokenAmount(amountIn)} ${directionAtoB ? 'Token A' : 'Token B'}`);

  // 1. Derive pool PDA
  const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
    [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
    AMM_PROGRAM_ID
  );

  // 2. Use actual vault addresses from InitPool
  const vaultA = new PublicKey("6mZhTti941V2HURaYUHtdAMQeM4oRQNozUpaiv9eNXQf");
  const vaultB = new PublicKey("6H3yozauFzxWcuLYgDy8eTnTc83C7vCBYeHDjQYiwMpF");

  // 3. User ATAs
  const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
  const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

  // 4. Check balances before swap
  const balanceTokenABefore = await getTokenBalance(userTokenA);
  const balanceTokenBBefore = await getTokenBalance(userTokenB);
  console.log(`📊 Before Swap:`);
  console.log(`  Token A: ${formatTokenAmount(balanceTokenABefore)}`);
  console.log(`  Token B: ${formatTokenAmount(balanceTokenBBefore)}`);

  // 5. Calculate expected fee (0.3% fee)
  const feeRate = 0.003;
  const fee = amountIn * feeRate;
  const amountInWithFee = amountIn * (1 - feeRate);
  
  console.log(`💰 Fee Calculation:`);
  console.log(`  Fee Rate: ${(feeRate * 100).toFixed(2)}%`);
  console.log(`  Fee Amount: ${formatTokenAmount(fee)} ${directionAtoB ? 'Token A' : 'Token B'}`);
  console.log(`  Amount After Fee: ${formatTokenAmount(amountInWithFee)} ${directionAtoB ? 'Token A' : 'Token B'}`);

  // 6. Prepare accounts for Swap
  const accounts = [
    { pubkey: poolPDA, isSigner: false, isWritable: true },
    { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
    { pubkey: vaultA, isSigner: false, isWritable: true },
    { pubkey: vaultB, isSigner: false, isWritable: true },
    { pubkey: directionAtoB ? userTokenA : userTokenB, isSigner: false, isWritable: true },
    { pubkey: directionAtoB ? userTokenB : userTokenA, isSigner: false, isWritable: true },
    { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
    { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  // 7. Instruction data
  const data = Buffer.alloc(1 + 8 + 1);
  data.writeUInt8(3, 0); // Swap discriminator
  data.writeBigUInt64LE(BigInt(amountIn), 1);
  data.writeUInt8(directionAtoB ? 1 : 0, 9);

  // 8. Create and send transaction
  const tx = new Transaction();
  tx.add({
    keys: accounts,
    programId: AMM_PROGRAM_ID,
    data,
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  // 9. Check balances after swap
  const balanceTokenAAfter = await getTokenBalance(userTokenA);
  const balanceTokenBAfter = await getTokenBalance(userTokenB);
  console.log(`📊 After Swap:`);
  console.log(`  Token A: ${formatTokenAmount(balanceTokenAAfter)}`);
  console.log(`  Token B: ${formatTokenAmount(balanceTokenBAfter)}`);

  // 10. Calculate actual changes
  const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
  const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;

  console.log(`🔄 Swap Results:`);
  console.log(`  Token A Change: ${formatTokenAmount(tokenAChange)} (${tokenAChange > 0 ? '+' : ''}${tokenAChange} raw)`);
  console.log(`  Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange > 0 ? '+' : ''}${tokenBChange} raw)`);

  // Calculate actual fee from the AMM formula
  const actualAmountOut = directionAtoB ? (balanceTokenBAfter - balanceTokenBBefore) : (balanceTokenAAfter - balanceTokenABefore);
  const actualAmountIn = directionAtoB ? (balanceTokenABefore - balanceTokenAAfter) : (balanceTokenBBefore - balanceTokenBAfter);
  
  // The fee is the difference between what should be output (without fees) vs actual output
  // Using AMM formula: (amount_in * 997 / 1000) * reserve_out / (reserve_in + amount_in * 997 / 1000)
  const amountAfterFeeDeduction = Math.floor(actualAmountIn * 997 / 1000);
  const calculatedFee = actualAmountIn - amountAfterFeeDeduction;
  
  totalFeesToken += calculatedFee;
  
  if (directionAtoB) {
    totalFeesTokenA += calculatedFee;
  } else {
    totalFeesTokenB += calculatedFee;
  }

  console.log(`💰 Swap Summary (${directionAtoB ? "A → B" : "B → A"}):`);
  console.log(`  Input: ${formatTokenAmount(actualAmountIn)} ${directionAtoB ? "Token A" : "Token B"}`);
  console.log(`  Output: ${formatTokenAmount(Math.abs(actualAmountOut))} ${directionAtoB ? "Token B" : "Token A"}`);
  console.log(`  Fee Paid: ${formatTokenAmount(calculatedFee)} ${directionAtoB ? "Token A" : "Token B"}`);
  console.log(`  Effective Rate: 1 ${directionAtoB ? "Token A" : "Token B"} = ${(Math.abs(actualAmountOut) / actualAmountIn).toFixed(6)} ${directionAtoB ? "Token B" : "Token A"}`);

  console.log(`✅ Transaction: ${sig}`);
  console.log(`�� GorbScan: https://gorbscan.com/tx/${sig}`);

  return {
    sig,
    tokenAChange,
    tokenBChange,
    actualFee: directionAtoB ? -tokenAChange - amountIn : -tokenBChange - amountIn
  };
}

async function main() {
  try {
    console.log("🚀 Starting Comprehensive Swap Tests...");
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // Check initial balances
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);

    console.log("\n📊 Initial Balances:");
    const initialTokenA = await getTokenBalance(userTokenA);
    const initialTokenB = await getTokenBalance(userTokenB);
    console.log(`Token A: ${formatTokenAmount(initialTokenA)} (${initialTokenA} raw)`);
    console.log(`Token B: ${formatTokenAmount(initialTokenB)} (${initialTokenB} raw)`);

    console.log("\n============================================================");

    // Test 1: A → B swap
    console.log("\n" + "=".repeat(60));
    console.log("🔄 TEST 1: Token A → Token B Swap");
    console.log("=".repeat(60));
    
    const swap1Amount = 300_000_000; // 0.3 tokens (increased from 0.05)
    const swap1Result = await performSwap(true, swap1Amount);

    // Wait a bit between swaps
    console.log("\n⏳ Waiting 3 seconds before next swap...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 2: B → A swap
    console.log("\n" + "=".repeat(60));
    console.log("🔄 TEST 2: Token B → Token A Swap");
    console.log("=".repeat(60));
    
    const swap2Amount = 200_000_000; // 0.2 tokens (increased from 0.03)
    const swap2Result = await performSwap(false, swap2Amount);

    // Final balance check
    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL BALANCE SUMMARY");
    console.log("=".repeat(60));
    
    const finalTokenA = await getTokenBalance(userTokenA);
    const finalTokenB = await getTokenBalance(userTokenB);
    
    console.log(`Initial Token A: ${formatTokenAmount(initialTokenA)}`);
    console.log(`Final Token A: ${formatTokenAmount(finalTokenA)}`);
    console.log(`Token A Net Change: ${formatTokenAmount(finalTokenA - initialTokenA)} (${finalTokenA - initialTokenA > 0 ? '+' : ''}${finalTokenA - initialTokenA} raw)`);
    
    console.log(`\nInitial Token B: ${formatTokenAmount(initialTokenB)}`);
    console.log(`Final Token B: ${formatTokenAmount(finalTokenB)}`);
    console.log(`Token B Net Change: ${formatTokenAmount(finalTokenB - initialTokenB)} (${finalTokenB - initialTokenB > 0 ? '+' : ''}${finalTokenB - initialTokenB} raw)`);

    console.log("\n💰 Total Fees Paid:");
    console.log(`Token A Fees: ${formatTokenAmount(totalFeesTokenA)} (${totalFeesTokenA} raw)`);
    console.log(`Token B Fees: ${formatTokenAmount(totalFeesTokenB)} (${totalFeesTokenB} raw)`);
    console.log(`Total Fees: ${formatTokenAmount(totalFeesTokenA + totalFeesTokenB)} tokens`);

    console.log(`\n✅ All swap tests completed successfully!`);

  } catch (error) {
    console.error("❌ Error in swap tests:", error.message);
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