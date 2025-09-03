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

// Pool 2 (B-C) tokens
const TOKEN_B_MINT = new PublicKey("AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH");
const TOKEN_C_MINT = new PublicKey("EnpmunfM7kxxgLSJXd3ZG5jaJShMqJF9so95NcXJv1UW");

// Pool 2 LP mint (from successful initialization)
const LP_MINT = new PublicKey("Brqgz5Lvq6St3WVLsAYvupZRiuZtzqsZHJi1FvM4YXuY");

// Pool 2 vaults (from successful initialization)
const VAULT_B = new PublicKey("FTMqVxLRMpCpSPaUAHNKgSFmq6BoEULbb6QfYkPNhMCE");
const VAULT_C = new PublicKey("Ei2eeRY1X8hG9VJ6PVyT7mcLUPcXUEa4uJqoA5LACW85");

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
    console.log("🚀 Starting AddLiquidity to Pool 2 (B-C)...");
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`Token C: ${TOKEN_C_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // 1. Derive pool PDA
    const [poolPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_B_MINT.toBuffer(), TOKEN_C_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. User ATAs
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenC = getAssociatedTokenAddressSync(TOKEN_C_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    
    console.log(`User Token B ATA: ${userTokenB.toString()}`);
    console.log(`User Token C ATA: ${userTokenC.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 3. Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity to Pool 2:");
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const balanceTokenCBefore = await getTokenBalance(userTokenC);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`Token C: ${formatTokenAmount(balanceTokenCBefore)} (${balanceTokenCBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // 4. Liquidity parameters
    const amountB = 500_000_000; // 0.5 Token B
    const amountC = 500_000_000; // 0.5 Token C
    
    console.log(`\n💧 Liquidity Parameters for Pool 2:`);
    console.log(`Amount B: ${formatTokenAmount(amountB)} Token B`);
    console.log(`Amount C: ${formatTokenAmount(amountC)} Token C`);
    console.log(`Ratio: 1:1`);

    // 5. Prepare accounts for AddLiquidity
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_C_MINT, isSigner: false, isWritable: false },
      { pubkey: VAULT_B, isSigner: false, isWritable: true },
      { pubkey: VAULT_C, isSigner: false, isWritable: true },
      { pubkey: LP_MINT, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userTokenC, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 6. Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountB), 1);
    data.writeBigUInt64LE(BigInt(amountC), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 7. Create transaction
    const tx = new Transaction();

    // Add AddLiquidity instruction
    console.log("📝 Adding AddLiquidity instruction for Pool 2...");
    
    tx.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("📤 Sending transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    
    console.log("✅ AddLiquidity to Pool 2 successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // 8. Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity to Pool 2:");
    console.log("Waiting 2 seconds for transaction to settle...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceTokenCAfter = await getTokenBalance(userTokenC);
    const balanceLPAfter = await getTokenBalance(userLP);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`Token C: ${formatTokenAmount(balanceTokenCAfter)} (${balanceTokenCAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 9. Calculate changes
    const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
    const tokenCChange = balanceTokenCAfter - balanceTokenCBefore;
    const lpChange = balanceLPAfter - balanceLPBefore;
    
    console.log("\n💧 Liquidity Addition Results for Pool 2:");
    console.log(`Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange} raw)`);
    console.log(`Token C Change: ${formatTokenAmount(tokenCChange)} (${tokenCChange} raw)`);
    console.log(`LP Tokens Gained: ${formatTokenAmount(lpChange)} (${lpChange} raw)`);

    console.log(`\n💰 Pool 2 Liquidity Summary:`);
    console.log(`Tokens Provided:`);
    console.log(`  - Token B: ${formatTokenAmount(-tokenBChange)} (${-tokenBChange} raw)`);
    console.log(`  - Token C: ${formatTokenAmount(-tokenCChange)} (${-tokenCChange} raw)`);
    console.log(`LP Tokens Received: ${formatTokenAmount(lpChange)} (${lpChange} raw)`);
    console.log(`Total Value Locked in Pool 2: ${formatTokenAmount(-tokenBChange + -tokenCChange)} tokens`);
    
    console.log(`\n🎯 Now you can test RemoveLiquidity from Pool 2 (B-C)!`);
    
  } catch (error) {
    console.error("❌ Error in AddLiquidity to Pool 2:", error.message);
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