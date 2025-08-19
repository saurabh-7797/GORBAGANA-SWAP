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
  createInitializeMintInstruction,
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
const LP_MINT = Keypair.generate();

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
    console.log("🚀 Starting InitPool transaction...");
    console.log(`Token A: ${TOKEN_A_MINT.toString()}`);
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`LP Mint: ${LP_MINT.publicKey.toString()}`);

    // 1. Derive pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_A_MINT.toBuffer(), TOKEN_B_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Create vault accounts as regular accounts (not PDAs)
    const vaultA = Keypair.generate();
    const vaultB = Keypair.generate();
    console.log(`Vault A: ${vaultA.publicKey.toString()}`);
    console.log(`Vault B: ${vaultB.publicKey.toString()}`);

    // 3. User ATAs
    const userTokenA = getAssociatedTokenAddressSync(TOKEN_A_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(LP_MINT.publicKey, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token A ATA: ${userTokenA.toString()}`);
    console.log(`User Token B ATA: ${userTokenB.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenABefore = await getTokenBalance(userTokenA);
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    console.log(`Token A: ${formatTokenAmount(balanceTokenABefore)} (${balanceTokenABefore} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);

    // 5. Pool initialization parameters
    const amountA = 1_000_000_000; // 1 token
    const amountB = 1_000_000_000; // 1 token
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token A: ${formatTokenAmount(amountA)} Token A`);
    console.log(`Initial Token B: ${formatTokenAmount(amountB)} Token B`);
    console.log(`Initial Ratio: 1:1`);
    console.log(`Expected LP Tokens: ${formatTokenAmount(Math.sqrt(amountA * amountB))} LP tokens`);

    // 6. Prepare accounts for InitPool (see lib.rs)
    // [pool, token_a, token_b, vault_a, vault_b, lp_mint, user, user_token_a, user_token_b, user_lp, token_program, system_program, rent]
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_A_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultA.publicKey, isSigner: true, isWritable: true },
      { pubkey: vaultB.publicKey, isSigner: true, isWritable: true },
      { pubkey: LP_MINT.publicKey, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // 7. Instruction data (Borsh: InitPool { amount_a, amount_b })
    const data = Buffer.alloc(1 + 8 + 8); // 1 byte discriminator + 2x u64
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountA), 1);
    data.writeBigUInt64LE(BigInt(amountB), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 8. Create transaction
    const tx = new Transaction();

    // Create LP mint account
    console.log("📝 Creating LP mint account...");
    tx.add(SystemProgram.createAccount({
      fromPubkey: userKeypair.publicKey,
      newAccountPubkey: LP_MINT.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(82),
      space: 82,
      programId: SPL_TOKEN_PROGRAM_ID,
    }));

    // Initialize LP mint
    console.log("📝 Initializing LP mint...");
    tx.add(
      createInitializeMintInstruction(
        LP_MINT.publicKey,
        9, // decimals
        poolPDA, // mint authority (pool PDA)
        poolPDA, // freeze authority (pool PDA)
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // Create user LP ATA if needed
    const userLPAccount = await connection.getAccountInfo(userLP);
    if (!userLPAccount) {
      console.log("📝 Creating user LP ATA...");
      tx.add(createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        userLP,
        userKeypair.publicKey,
        LP_MINT.publicKey,
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      ));
    } else {
      console.log("✅ User LP ATA already exists");
    }

    // Add InitPool instruction
    console.log("📝 Adding InitPool instruction...");
    
    tx.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("📤 Sending transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [userKeypair, vaultA, vaultB, LP_MINT], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    
    console.log("✅ InitPool transaction successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // 9. Check balances after pool initialization
    console.log("\n📊 Balances AFTER Pool Initialization:");
    const balanceTokenAAfter = await getTokenBalance(userTokenA);
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceLPAfter = await getTokenBalance(userLP);
    console.log(`Token A: ${formatTokenAmount(balanceTokenAAfter)} (${balanceTokenAAfter} raw)`);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // 10. Calculate actual changes
    const tokenAChange = balanceTokenAAfter - balanceTokenABefore;
    const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
    
    console.log("\n🏊 Pool Initialization Results:");
    console.log(`Token A Change: ${formatTokenAmount(tokenAChange)} (${tokenAChange > 0 ? '+' : ''}${tokenAChange} raw)`);
    console.log(`Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange > 0 ? '+' : ''}${tokenBChange} raw)`);
    console.log(`LP Tokens Received: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);
    
    console.log(`\n💰 Pool Summary:`);
    console.log(`Initial Liquidity Provided:`);
    console.log(`  - Token A: ${formatTokenAmount(-tokenAChange)} (${-tokenAChange} raw)`);
    console.log(`  - Token B: ${formatTokenAmount(-tokenBChange)} (${-tokenBChange} raw)`);
    console.log(`LP Tokens Received: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);
    console.log(`Total Value Locked: ${formatTokenAmount(-tokenAChange + -tokenBChange)} tokens`);
    console.log(`Pool Share: 100% (initial liquidity provider)`);
    
    // Print pool info
    console.log("\n🏊 Pool Information:");
    console.log(`Pool Address: ${poolPDA.toString()}`);
    console.log(`LP Mint: ${LP_MINT.publicKey.toString()}`);
    console.log(`Vault A: ${vaultA.publicKey.toString()}`);
    console.log(`Vault B: ${vaultB.publicKey.toString()}`);
    console.log(`Initial Liquidity: ${formatTokenAmount(-tokenAChange)} Token A + ${formatTokenAmount(-tokenBChange)} Token B`);
    
  } catch (error) {
    console.error("❌ Error in InitPool:", error.message);
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