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
const LP_MINT = new PublicKey("Et4tsaB7RZomDix74wNr1BaqFA3s5bEPbLjmTkrP7mK2"); // From successful InitPool

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
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
    }
  }
}

// Helper function to format token amounts
function formatTokenAmount(amount, decimals = 9) {
  return (amount / Math.pow(10, decimals)).toFixed(6);
}

async function main() {
  try {
    console.log("🚀 Starting AddLiquidity transaction...");
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
    const userLP = getAssociatedTokenAddressSync(LP_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User Token B ATA: ${userTokenB.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before adding liquidity
    console.log("\n📊 Balances BEFORE Adding Liquidity:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const balanceLPBefore = await getTokenBalance(userLP);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPBefore)} (${balanceLPBefore} raw)`);

    // 5. Liquidity parameters
    const amountA = 500_000_000; // 0.5 tokens
    const amountB = 500_000_000; // 0.5 tokens
    
    console.log(`\n💧 Liquidity Parameters:`);
    console.log(`Amount A: ${formatTokenAmount(amountA)} Token A`);
    console.log(`Amount B: ${formatTokenAmount(amountB)} Token B`);
    console.log(`Ratio: 1:1`);

    // 6. Prepare accounts for AddLiquidity (see lib.rs)
    // [pool, token_a, token_b, vault_a, vault_b, lp_mint, user_token_a, user_token_b, user_lp, user, token_program]
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultA, isSigner: false, isWritable: true },
      { pubkey: vaultB, isSigner: false, isWritable: true },
      { pubkey: LP_MINT, isSigner: false, isWritable: true },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 7. Instruction data (Borsh: AddLiquidity { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(1, 0); // AddLiquidity discriminator
    data.writeBigUInt64LE(BigInt(amountA), 1);
    data.writeBigUInt64LE(BigInt(amountB), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 8. Create transaction
    const tx = new Transaction();

    // Add AddLiquidity instruction
    console.log("📝 Adding AddLiquidity instruction...");
    
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
    
    console.log("✅ AddLiquidity transaction successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // 9. Check balances after adding liquidity
    console.log("\n📊 Balances AFTER Adding Liquidity:");
    try {
      console.log("Waiting 2 seconds for transaction to settle...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const balanceTokenAAfter = await getTokenBalance(userTokenA);
      const balanceTokenBAfter = await getTokenBalance(userTokenB);
      const balanceLPAfter = await getTokenBalance(userLP);
      console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
      console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
      console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

      // 10. Calculate actual changes
      const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
      const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
      const lpChange = balanceLPAfter - balanceLPBefore;
      
      console.log("\n💧 Liquidity Addition Results:");
      console.log(`Token A Change: ${formatTokenAmount(tokenAChange)} (${tokenAChange > 0 ? '+' : ''}${tokenAChange} raw)`);
      console.log(`Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange > 0 ? '+' : ''}${tokenBChange} raw)`);
      console.log(`LP Tokens Gained: ${formatTokenAmount(lpChange)} (${lpChange > 0 ? '+' : ''}${lpChange} raw)`);
      
      console.log(`\n💰 Liquidity Summary:`);
      console.log(`Tokens Provided:`);
      console.log(`  - Token A: ${formatTokenAmount(-tokenAChange)} (${-tokenAChange} raw)`);
      console.log(`  - Token B: ${formatTokenAmount(-tokenBChange)} (${-tokenBChange} raw)`);
      console.log(`LP Tokens Received: ${formatTokenAmount(lpChange)} (${lpChange} raw)`);
      console.log(`Total Value Locked: ${formatTokenAmount(-tokenAChange + -tokenBChange)} tokens`);
    } catch (error) {
      console.log("⚠️  Could not fetch final balances due to network issues, but transaction was successful!");
      console.log("You can check balances manually or try running the script again.");
    }
    
  } catch (error) {
    console.error("❌ Error in AddLiquidity:", error.message);
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