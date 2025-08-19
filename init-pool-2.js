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
  createMintToInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} = require("@solana/spl-token");
const fs = require("fs");

// --- CONFIG ---
const RPC_ENDPOINT = "https://rpc.gorbchain.xyz";
const WS_ENDPOINT = "wss://rpc.gorbchain.xyz/ws/";
const AMM_PROGRAM_ID = new PublicKey("8qhCTESZN9xDCHvtXFdCHfsgcctudbYdzdCFzUkTTMMe");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6");
const ATA_PROGRAM_ID = new PublicKey("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm");

// Pool 2: Token B (from Pool 1) + Token C (new)
const TOKEN_B_MINT = new PublicKey("AtZBwYcxgP2c9KYL1iezZrf8t7bbXTssSt6Aoz3h9wbH"); // From Pool 1
const TOKEN_C_MINT = new PublicKey("EnpmunfM7kxxgLSJXd3ZG5jaJShMqJF9so95NcXJv1UW"); // New token

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
    console.log("🚀 Starting Pool 2 Initialization (B-C Pool)...");
    console.log(`Token B: ${TOKEN_B_MINT.toString()}`);
    console.log(`Token C: ${TOKEN_C_MINT.toString()}`);

    // Generate new LP mint for this pool
    const lpMintKeypair = Keypair.generate();
    console.log(`LP Mint: ${lpMintKeypair.publicKey.toString()}`);

    // 1. Derive pool PDA
    const [poolPDA, poolBump] = await PublicKey.findProgramAddress(
      [Buffer.from("pool"), TOKEN_B_MINT.toBuffer(), TOKEN_C_MINT.toBuffer()],
      AMM_PROGRAM_ID
    );
    console.log(`Pool PDA: ${poolPDA.toString()}`);

    // 2. Generate vault keypairs
    const vaultBKeypair = Keypair.generate();
    const vaultCKeypair = Keypair.generate();
    console.log(`Vault B: ${vaultBKeypair.publicKey.toString()}`);
    console.log(`Vault C: ${vaultCKeypair.publicKey.toString()}`);

    // 3. User ATAs
    const userTokenB = getAssociatedTokenAddressSync(TOKEN_B_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userTokenC = getAssociatedTokenAddressSync(TOKEN_C_MINT, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    const userLP = getAssociatedTokenAddressSync(lpMintKeypair.publicKey, userKeypair.publicKey, false, SPL_TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
    console.log(`User Token B ATA: ${userTokenB.toString()}`);
    console.log(`User Token C ATA: ${userTokenC.toString()}`);
    console.log(`User LP ATA: ${userLP.toString()}`);

    // 4. Check balances before pool initialization
    console.log("\n📊 Balances BEFORE Pool Initialization:");
    const balanceTokenBBefore = await getTokenBalance(userTokenB);
    const balanceTokenCBefore = await getTokenBalance(userTokenC);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBBefore)} (${balanceTokenBBefore} raw)`);
    console.log(`Token C: ${formatTokenAmount(balanceTokenCBefore)} (${balanceTokenCBefore} raw)`);

    // 5. Pool initialization parameters
    const amountB = 1_000_000_000; // 1.0 Token B
    const amountC = 1_000_000_000; // 1.0 Token C
    
    console.log(`\n🏊 Pool Initialization Parameters:`);
    console.log(`Initial Token B: ${formatTokenAmount(amountB)} Token B`);
    console.log(`Initial Token C: ${formatTokenAmount(amountC)} Token C`);
    console.log(`Initial Ratio: 1:1`);
    console.log(`Expected LP Tokens: ${formatTokenAmount(Math.sqrt(amountB * amountC))} LP tokens`);

    // 6. Prepare accounts for InitPool
    const accounts = [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_B_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_C_MINT, isSigner: false, isWritable: false },
      { pubkey: vaultBKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: vaultCKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: lpMintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: userTokenC, isSigner: false, isWritable: true },
      { pubkey: userLP, isSigner: false, isWritable: true },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // 7. Instruction data
    const data = Buffer.alloc(1 + 8 + 8);
    data.writeUInt8(0, 0); // InitPool discriminator
    data.writeBigUInt64LE(BigInt(amountB), 1);
    data.writeBigUInt64LE(BigInt(amountC), 9);
    
    console.log(`\n📝 Instruction data: ${data.toString('hex')}`);

    // 8. Create transaction
    const tx = new Transaction();

    // Create LP mint account
    console.log("📝 Creating LP mint account...");
    const lpMintLamports = await getMinimumBalanceForRentExemptMint(connection);
    tx.add(
      SystemProgram.createAccount({
        fromPubkey: userKeypair.publicKey,
        newAccountPubkey: lpMintKeypair.publicKey,
        lamports: lpMintLamports,
        space: MINT_SIZE,
        programId: SPL_TOKEN_PROGRAM_ID,
      })
    );

    // Initialize LP mint
    console.log("📝 Initializing LP mint...");
    tx.add(
      createInitializeMintInstruction(
        lpMintKeypair.publicKey,
        9, // decimals
        poolPDA, // mint authority
        null, // freeze authority
        SPL_TOKEN_PROGRAM_ID
      )
    );

    // Create user LP ATA
    console.log("📝 Creating user LP ATA...");
    tx.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        userLP,
        userKeypair.publicKey,
        lpMintKeypair.publicKey,
        SPL_TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID
      )
    );

    // Add InitPool instruction
    console.log("📝 Adding InitPool instruction...");
    tx.add({
      keys: accounts,
      programId: AMM_PROGRAM_ID,
      data,
    });

    // Send transaction
    console.log("📤 Sending transaction...");
    const sig = await sendAndConfirmTransaction(connection, tx, [
      userKeypair,
      lpMintKeypair,
      vaultBKeypair,
      vaultCKeypair,
    ], {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    
    console.log("✅ Pool 2 InitPool transaction successful!");
    console.log(`Transaction signature: ${sig}`);
    console.log(`View on GorbScan: https://gorbscan.com/tx/${sig}`);
    
    // Wait and check final balances
    console.log("\n📊 Balances AFTER Pool Initialization:");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const balanceTokenBAfter = await getTokenBalance(userTokenB);
    const balanceTokenCAfter = await getTokenBalance(userTokenC);
    const balanceLPAfter = await getTokenBalance(userLP);
    console.log(`Token B: ${formatTokenAmount(balanceTokenBAfter)} (${balanceTokenBAfter} raw)`);
    console.log(`Token C: ${formatTokenAmount(balanceTokenCAfter)} (${balanceTokenCAfter} raw)`);
    console.log(`LP Tokens: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    // Calculate changes
    const tokenBChange = balanceTokenBAfter - balanceTokenBBefore;
    const tokenCChange = balanceTokenCAfter - balanceTokenCBefore;
    
    console.log("\n🏊 Pool Initialization Results:");
    console.log(`Token B Change: ${formatTokenAmount(tokenBChange)} (${tokenBChange} raw)`);
    console.log(`Token C Change: ${formatTokenAmount(tokenCChange)} (${tokenCChange} raw)`);
    console.log(`LP Tokens Received: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);

    console.log(`\n💰 Pool Summary:`);
    console.log(`Initial Liquidity Provided:`);
    console.log(`  - Token B: ${formatTokenAmount(-tokenBChange)} (${-tokenBChange} raw)`);
    console.log(`  - Token C: ${formatTokenAmount(-tokenCChange)} (${-tokenCChange} raw)`);
    console.log(`LP Tokens Received: ${formatTokenAmount(balanceLPAfter)} (${balanceLPAfter} raw)`);
    console.log(`Total Value Locked: ${formatTokenAmount(-tokenBChange + -tokenCChange)} tokens`);
    console.log(`Pool Share: 100% (initial liquidity provider)`);

    console.log(`\n🏊 Pool 2 Information:`);
    console.log(`Pool Address: ${poolPDA.toString()}`);
    console.log(`LP Mint: ${lpMintKeypair.publicKey.toString()}`);
    console.log(`Vault B: ${vaultBKeypair.publicKey.toString()}`);
    console.log(`Vault C: ${vaultCKeypair.publicKey.toString()}`);
    console.log(`Initial Liquidity: ${formatTokenAmount(-tokenBChange)} Token B + ${formatTokenAmount(-tokenCChange)} Token C`);
    
  } catch (error) {
    console.error("❌ Error in Pool 2 InitPool:", error.message);
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