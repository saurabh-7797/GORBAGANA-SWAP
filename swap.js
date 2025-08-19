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
const LP_MINT = new PublicKey("Bsb26ojJdPGHQ97HokmZAMuwDkK5RRVwtyW1VBUJrQNy"); // From successful InitPool

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

async function main() {
  try {
    console.log("🚀 Starting Swap transaction...");
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.toString()}`);

    // 1. Derive pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Use actual vault addresses from InitPool (not PDAs)
    const vaultA = new PublicKey("6mZhTti941V2HURaYUHtdAMQeM4oRQNozUpaiv9eNXQf");
    const vaultB = new PublicKey("6H3yozauFzxWcuLYgDy8eTnTc83C7vCBYeHDjQYiwMpF");
    console.log(`Vault A: ${vaultA.toString()}`);
    console.log(`Vault B: ${vaultB.toString()}`);

    // 3. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User Token B ATA: ${userTokenB.toString()}`);

    // 4. Check balances before swap
    console.log("\n📊 Balances BEFORE Swap:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);

    // 5. Swap parameters
    const amountIn = 500_000_000; // 0.5 tokens (increased from 0.1)
    const directionAtoB = true; // true = A to B, false = B to A
    
    console.log(`\n🔄 Swap Parameters:`);
    console.log(`Amount In: ${formatTokenAmount(amountIn)} ${directionAtoB ? 'Token A' : 'Token B'}`);
    console.log(`Direction: ${directionAtoB ? 'A → B' : 'B → A'}`);

    // 6. Calculate expected output and fee (0.3% fee)
    const feeRate = 0.003; // 0.3%
    const amountInWithFee = amountIn * (1 - feeRate);
    const fee = amountIn * feeRate;
    
    console.log(`\n💰 Fee Calculation:`);
    console.log(`Fee Rate: ${(feeRate * 100).toFixed(2)}%`);
    console.log(`Fee Amount: ${formatTokenAmount(fee)} ${directionAtoB ? 'Token A' : 'Token B'}`);
    console.log(`Amount After Fee: ${formatTokenAmount(amountInWithFee)} ${directionAtoB ? 'Token A' : 'Token B'}`);

    // 7. Prepare accounts for Swap (see lib.rs)
    // [pool, token_a, token_b, vault_a, vault_b, user_in, user_out, user, token_program]
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultA, isSigner: false, isWritable: true },
      { pubkey: vaultB, isSigner: false, isWritable: true },
      { pubkey: directionAtoB ? userTokenA : userTokenB, isSigner: false, isWritable: true }, // user_in
      { pubkey: directionAtoB ? userTokenB : userTokenA, isSigner: false, isWritable: true }, // user_out
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 8. Instruction data (Borsh: Swap { amount_in, direction_a_to_b })
    const data = Buffer.alloc(1 + 8 + 1); // 1 byte discriminator + u64 + bool
    data.writeUInt8(3, 0); // Swap discriminator
    data.writeBigUInt64LE(BigInt(amountIn), 1);
    data.writeUInt8(directionAtoB ? 1 : 0, 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 9. Create transaction
    const tx = new Transaction();

    // Add Swap instruction
    console.log("📝 Adding Swap instruction...");
    
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
    
    console.log("✅ Swap transaction successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // 10. Check balances after swap
    console.log("\n📊 Balances AFTER Swap:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);

    // 11. Calculate actual changes
    const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
    const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
    
    console.log("\n🔄 Swap Results:");
    console.log(`Token A Change: ${formatTokenAmount(tokenAChange)} (${tokenAChange > 0 ? '+' : ''}${tokenAChange} raw)`);
    console.log(`Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange > 0 ? '+' : ''}${tokenBChange} raw)`);
    
    if (directionAtoB) {
      console.log(`\n💰 Swap Summary (A → B):`);
      console.log(`Input: ${formatTokenAmount(amountIn)} Token A`);
      console.log(`Output: ${formatTokenAmount(-tokenBChange)} Token B`);
      console.log(`Fee Paid: ${formatTokenAmount(-tokenAChange - amountIn)} Token A`);
      console.log(`Exchange Rate: 1 Token A = ${formatTokenAmount(-tokenBChange / amountIn)} Token B`);
    } else {
      console.log(`\n💰 Swap Summary (B → A):`);
      console.log(`Input: ${formatTokenAmount(amountIn)} Token B`);
      console.log(`Output: ${formatTokenAmount(-tokenAChange)} Token A`);
      console.log(`Fee Paid: ${formatTokenAmount(-tokenBChange - amountIn)} Token B`);
      console.log(`Exchange Rate: 1 Token B = ${formatTokenAmount(-tokenAChange / amountIn)} Token A`);
    }
    
  } catch (error) {
    console.error("❌ Error in Swap:", error.message);
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