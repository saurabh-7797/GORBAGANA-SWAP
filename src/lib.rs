use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use std::str::FromStr;
// Remove the standard spl_token import and create manual instructions
// use spl_token::{
//     instruction::{burn, mint_to, transfer},
// };
use borsh::{BorshDeserialize, BorshSerialize};

// Program ID
solana_program::declare_id!("8qhCTESZN9xDCHvtXFdCHfsgcctudbYdzdCFzUkTTMMe");

// GorbChain SPL Token Program ID
const GORBCHAIN_SPL_TOKEN_PROGRAM: &str = "G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6";

// Manual instruction creation for GorbChain SPL Token program
fn create_transfer_instruction(
    source: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(3); // Transfer instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*source, false),
            solana_program::instruction::AccountMeta::new(*destination, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_mint_to_instruction(
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(7); // MintTo instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*mint, false),
            solana_program::instruction::AccountMeta::new(*destination, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_burn_instruction(
    account: &Pubkey,
    mint: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(8); // Burn instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*account, false),
            solana_program::instruction::AccountMeta::new(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_initialize_account_instruction(
    account: &Pubkey,
    mint: &Pubkey,
    authority: &Pubkey,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(1); // InitializeAccount instruction discriminator
        buf
    };

    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*account, false),
            solana_program::instruction::AccountMeta::new_readonly(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, false),
            solana_program::instruction::AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
        ],
        data,
    }
}

// Entry point
entrypoint!(process_instruction);

// Instructions
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum TestProjectInstruction {
    InitPool { amount_a: u64, amount_b: u64 },
    AddLiquidity { amount_a: u64, amount_b: u64 },
    RemoveLiquidity { lp_amount: u64 },
    Swap { amount_in: u64, direction_a_to_b: bool },
    MultihopSwap { amount_in: u64, minimum_amount_out: u64 },
    MultihopSwapWithPath { amount_in: u64, minimum_amount_out: u64, token_path: Vec<Pubkey> },
}

// Pool state
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Pool {
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub bump: u8,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub total_lp_supply: u64,
}

impl Sealed for Pool {}

impl IsInitialized for Pool {
    fn is_initialized(&self) -> bool {
        self.token_a != Pubkey::default()
    }
}

impl Pack for Pool {
    const LEN: usize = 32 + 32 + 1 + 8 + 8 + 8; // 89 bytes

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let pool = Pool::try_from_slice(src)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        Ok(pool)
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }
}

// Program instruction processor
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = TestProjectInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        TestProjectInstruction::InitPool { amount_a, amount_b } => {
            process_init_pool(program_id, accounts, amount_a, amount_b)
        }
        TestProjectInstruction::AddLiquidity { amount_a, amount_b } => {
            process_add_liquidity(program_id, accounts, amount_a, amount_b)
        }
        TestProjectInstruction::RemoveLiquidity { lp_amount } => {
            process_remove_liquidity(program_id, accounts, lp_amount)
        }
        TestProjectInstruction::Swap { amount_in, direction_a_to_b } => {
            process_swap(program_id, accounts, amount_in, direction_a_to_b)
        }
        TestProjectInstruction::MultihopSwap { amount_in, minimum_amount_out } => {
            process_multihop_swap(program_id, accounts, amount_in, minimum_amount_out)
        }
        TestProjectInstruction::MultihopSwapWithPath { amount_in, minimum_amount_out, token_path } => {
            process_multihop_swap_with_path(program_id, accounts, amount_in, minimum_amount_out, token_path)
        }
    }
}

fn process_init_pool(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;

    // Derive pool address and bump
    let (pool_pubkey, bump) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Create pool account
    let rent = Rent::from_account_info(rent_info)?;
    let space = Pool::LEN;
    let lamports = rent.minimum_balance(space);

    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        token_a_info.key.as_ref(),
        token_b_info.key.as_ref(),
        &[bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            pool_info.key,
            lamports,
            space as u64,
            program_id,
        ),
        &[
            user_info.clone(),
            pool_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Create vault accounts as regular accounts (not PDAs)
    // Create vault A account
    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            vault_a_info.key,
            rent.minimum_balance(165), // Token account size
            165,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            vault_a_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Create vault B account
    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            vault_b_info.key,
            rent.minimum_balance(165), // Token account size
            165,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            vault_b_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize vault A as token account
    invoke_signed(
        &create_initialize_account_instruction(
            vault_a_info.key,
            token_a_info.key,
            pool_info.key, // Authority is pool
        ),
        &[
            vault_a_info.clone(),
            token_a_info.clone(),
            pool_info.clone(), // Pool is signer
            rent_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize vault B as token account
    invoke_signed(
        &create_initialize_account_instruction(
            vault_b_info.key,
            token_b_info.key,
            pool_info.key, // Authority is pool
        ),
        &[
            vault_b_info.clone(),
            token_b_info.clone(),
            pool_info.clone(), // Pool is signer
            rent_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Transfer tokens to vaults
    invoke(
        &create_transfer_instruction(
            user_token_a_info.key,
            vault_a_info.key,
            user_info.key,
            amount_a,
        ),
        &[
            user_token_a_info.clone(),
            vault_a_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    invoke(
        &create_transfer_instruction(
            user_token_b_info.key,
            vault_b_info.key,
            user_info.key,
            amount_b,
        ),
        &[
            user_token_b_info.clone(),
            vault_b_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Calculate liquidity
    let liquidity: u64 = (amount_a as u128)
        .checked_mul(amount_b as u128)
        .unwrap()
        .integer_sqrt() as u64;

    // Mint LP tokens
    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize pool state
    let pool = Pool {
        token_a: *token_a_info.key,
        token_b: *token_b_info.key,
        bump,
        reserve_a: amount_a,
        reserve_b: amount_b,
        total_lp_supply: liquidity,
    };

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_add_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate final amounts maintaining ratio
    let (final_amount_a, final_amount_b) = if reserve_a > 0 && reserve_b > 0 {
        let required_b = (amount_a as u128)
            .checked_mul(reserve_b as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64;
        if required_b <= amount_b {
            (amount_a, required_b)
        } else {
            let required_a = (amount_b as u128)
                .checked_mul(reserve_a as u128).unwrap()
                .checked_div(reserve_b as u128).unwrap() as u64;
            (required_a, amount_b)
        }
    } else {
        (amount_a, amount_b)
    };

    // Transfer tokens to vaults
    invoke(
        &create_transfer_instruction(
            user_token_a_info.key,
            vault_a_info.key,
            user_info.key,
            final_amount_a,
        ),
        &[
            user_token_a_info.clone(),
            vault_a_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    invoke(
        &create_transfer_instruction(
            user_token_b_info.key,
            vault_b_info.key,
            user_info.key,
            final_amount_b,
        ),
        &[
            user_token_b_info.clone(),
            vault_b_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Calculate liquidity to mint
    let liquidity = if supply == 0 {
        (final_amount_a as u128)
            .checked_mul(final_amount_b as u128).unwrap()
            .integer_sqrt() as u64
    } else {
        (final_amount_a as u128)
            .checked_mul(supply as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64
    };

    // Mint LP tokens
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_add(final_amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_add(final_amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_add(liquidity).unwrap();

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_remove_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    lp_amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate amounts to withdraw
    let amount_a = (lp_amount as u128)
        .checked_mul(reserve_a as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;
    let amount_b = (lp_amount as u128)
        .checked_mul(reserve_b as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;

    // Burn LP tokens
    invoke(
        &create_burn_instruction(
            user_lp_info.key,
            lp_mint_info.key,
            user_info.key,
            lp_amount,
        ),
        &[
            user_lp_info.clone(),
            lp_mint_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Transfer tokens from vaults to user
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    invoke_signed(
        &create_transfer_instruction(
            vault_a_info.key,
            user_token_a_info.key,
            pool_info.key,
            amount_a,
        ),
        &[
            vault_a_info.clone(),
            user_token_a_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    invoke_signed(
        &create_transfer_instruction(
            vault_b_info.key,
            user_token_b_info.key,
            pool_info.key,
            amount_b,
        ),
        &[
            vault_b_info.clone(),
            user_token_b_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_sub(amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_sub(amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_sub(lp_amount).unwrap();

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_swap(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_in: u64,
    direction_a_to_b: bool,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let user_in_info = next_account_info(account_info_iter)?;
    let user_out_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;

    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );

    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let (reserve_in, reserve_out) = if direction_a_to_b {
        (pool.reserve_a, pool.reserve_b)
    } else {
        (pool.reserve_b, pool.reserve_a)
    };

    // Transfer input tokens to vault
    if direction_a_to_b {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_a_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_a_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    } else {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_b_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_b_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    }

    // Calculate output amount (with 0.3% fee)
    let amount_out = calculate_swap_output(amount_in, reserve_in, reserve_out)?;

    // Transfer output tokens from vault to user
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];

    if direction_a_to_b {
        invoke_signed(
            &create_transfer_instruction(
                vault_b_info.key,
                user_out_info.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_b_info.clone(),
                user_out_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
    } else {
        invoke_signed(
            &create_transfer_instruction(
                vault_a_info.key,
                user_out_info.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_a_info.clone(),
                user_out_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
    }

    // Update pool reserves
    if direction_a_to_b {
        pool.reserve_a = pool.reserve_a.checked_add(amount_in).unwrap();
        pool.reserve_b = pool.reserve_b.checked_sub(amount_out).unwrap();
    } else {
        pool.reserve_b = pool.reserve_b.checked_add(amount_in).unwrap();
        pool.reserve_a = pool.reserve_a.checked_sub(amount_out).unwrap();
    }

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_multihop_swap(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_in: u64,
    minimum_amount_out: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    
    // First account is user's input token account
    let user_input_account = next_account_info(account_info_iter)?;
    
    // The remaining accounts come in groups of 7 for each hop:
    // [pool, token_a, token_b, vault_a, vault_b, intermediate_token_account, next_token_account]
    // Last hop uses user's output account instead of next_token_account
    
    let mut remaining_accounts = Vec::new();
    while let Ok(account) = next_account_info(account_info_iter) {
        remaining_accounts.push(account);
    }
    
    if remaining_accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    
    // Calculate number of hops
    let num_hops = (remaining_accounts.len()) / 7;
    if remaining_accounts.len() % 7 != 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    
    let mut current_amount = amount_in;
    let mut current_input_account = user_input_account;
    
    // Process each hop
    for hop in 0..num_hops {
        let base_idx = hop * 7;
        let pool_info = remaining_accounts[base_idx];
        let token_a_info = remaining_accounts[base_idx + 1];
        let token_b_info = remaining_accounts[base_idx + 2];
        let vault_a_info = remaining_accounts[base_idx + 3];
        let vault_b_info = remaining_accounts[base_idx + 4];
        let intermediate_account = remaining_accounts[base_idx + 5];
        let output_account = remaining_accounts[base_idx + 6];
        
        let pool = Pool::unpack(&pool_info.data.borrow())?;
        
        // Verify pool seeds
        let (pool_pubkey, _) = Pubkey::find_program_address(
            &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
            program_id,
        );
        
        if pool_pubkey != *pool_info.key {
            return Err(ProgramError::InvalidSeeds);
        }
        
        // Determine swap direction by checking which vault matches the input token
        // We need to identify if we're swapping token A for token B or vice versa
        let direction_a_to_b = if hop == 0 {
            // For first hop, check user's input token account mint against pool tokens
            // This is a simplified approach - in practice you'd want to verify token account mints
            true // Assume A to B for now - this should be determined by token account analysis
        } else {
            // For subsequent hops, determine based on previous hop's output
            true // This should be calculated based on the token path
        };
        
        let (reserve_in, reserve_out, vault_in, vault_out) = if direction_a_to_b {
            (pool.reserve_a, pool.reserve_b, vault_a_info, vault_b_info)
        } else {
            (pool.reserve_b, pool.reserve_a, vault_b_info, vault_a_info)
        };
        
        // Transfer input tokens to vault
        invoke(
            &create_transfer_instruction(
                current_input_account.key,
                vault_in.key,
                user_info.key,
                current_amount,
            ),
            &[
                current_input_account.clone(),
                vault_in.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        // Calculate output amount (with 0.3% fee)
        let amount_out = calculate_swap_output(current_amount, reserve_in, reserve_out)?;
        
        // For the last hop, use the final output account; otherwise use intermediate account
        let target_output_account = if hop == num_hops - 1 {
            output_account
        } else {
            intermediate_account
        };
        
        // Transfer output tokens from vault to target account
        let pool_signer_seeds: &[&[_]] = &[
            b"pool",
            pool.token_a.as_ref(),
            pool.token_b.as_ref(),
            &[pool.bump],
        ];
        
        invoke_signed(
            &create_transfer_instruction(
                vault_out.key,
                target_output_account.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_out.clone(),
                target_output_account.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
        
        // Update pool reserves (we need to do this for each pool)
        let mut updated_pool = pool;
        if direction_a_to_b {
            updated_pool.reserve_a = updated_pool.reserve_a.checked_add(current_amount).unwrap();
            updated_pool.reserve_b = updated_pool.reserve_b.checked_sub(amount_out).unwrap();
        } else {
            updated_pool.reserve_b = updated_pool.reserve_b.checked_add(current_amount).unwrap();
            updated_pool.reserve_a = updated_pool.reserve_a.checked_sub(amount_out).unwrap();
        }
        
        Pool::pack(updated_pool, &mut pool_info.data.borrow_mut())?;
        
        // Set up for next hop
        current_amount = amount_out;
        current_input_account = if hop < num_hops - 1 {
            intermediate_account
        } else {
            output_account
        };
    }
    
    // Check minimum output requirement
    if current_amount < minimum_amount_out {
        return Err(ProgramError::InsufficientFunds);
    }
    
    Ok(())
}

fn process_multihop_swap_with_path(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_in: u64,
    minimum_amount_out: u64,
    token_path: Vec<Pubkey>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    
    // The first account is the user's input token account
    let user_input_account = next_account_info(account_info_iter)?;
    
    // The remaining accounts are the token path and vaults/intermediate accounts
    let mut remaining_accounts = Vec::new();
    while let Ok(account) = next_account_info(account_info_iter) {
        remaining_accounts.push(account);
    }
    
    if remaining_accounts.len() < 2 { // At least one token and one vault/intermediate
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    
    // The number of hops is the number of token path elements - 1
    let num_hops = remaining_accounts.len() - 1;
    
    let mut current_amount = amount_in;
    let mut current_input_account = user_input_account;
    
    // Process each hop
    for hop in 0..num_hops {
        let pool_info = remaining_accounts[hop];
        let token_a_info = remaining_accounts[hop + 1];
        let token_b_info = remaining_accounts[hop + 2];
        let vault_a_info = remaining_accounts[hop + 3];
        let vault_b_info = remaining_accounts[hop + 4];
        let intermediate_account = remaining_accounts[hop + 5];
        let output_account = remaining_accounts[hop + 6];
        
        let pool = Pool::unpack(&pool_info.data.borrow())?;
        
        // Verify pool seeds
        let (pool_pubkey, _) = Pubkey::find_program_address(
            &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
            program_id,
        );
        
        if pool_pubkey != *pool_info.key {
            return Err(ProgramError::InvalidSeeds);
        }
        
        // Determine swap direction by checking which vault matches the input token
        let direction_a_to_b = if hop == 0 {
            // For first hop, check user's input token account mint against pool tokens
            true // Assume A to B for now - this should be determined by token account analysis
        } else {
            // For subsequent hops, determine based on previous hop's output
            true // This should be calculated based on the token path
        };
        
        let (reserve_in, reserve_out, vault_in, vault_out) = if direction_a_to_b {
            (pool.reserve_a, pool.reserve_b, vault_a_info, vault_b_info)
        } else {
            (pool.reserve_b, pool.reserve_a, vault_b_info, vault_a_info)
        };
        
        // Transfer input tokens to vault
        invoke(
            &create_transfer_instruction(
                current_input_account.key,
                vault_in.key,
                user_info.key,
                current_amount,
            ),
            &[
                current_input_account.clone(),
                vault_in.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        // Calculate output amount (with 0.3% fee)
        let amount_out = calculate_swap_output(current_amount, reserve_in, reserve_out)?;
        
        // For the last hop, use the final output account; otherwise use intermediate account
        let target_output_account = if hop == num_hops - 1 {
            output_account
        } else {
            intermediate_account
        };
        
        // Transfer output tokens from vault to target account
        let pool_signer_seeds: &[&[_]] = &[
            b"pool",
            pool.token_a.as_ref(),
            pool.token_b.as_ref(),
            &[pool.bump],
        ];
        
        invoke_signed(
            &create_transfer_instruction(
                vault_out.key,
                target_output_account.key,
                pool_info.key,
                amount_out,
            ),
            &[
                vault_out.clone(),
                target_output_account.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;
        
        // Update pool reserves (we need to do this for each pool)
        let mut updated_pool = pool;
        if direction_a_to_b {
            updated_pool.reserve_a = updated_pool.reserve_a.checked_add(current_amount).unwrap();
            updated_pool.reserve_b = updated_pool.reserve_b.checked_sub(amount_out).unwrap();
        } else {
            updated_pool.reserve_b = updated_pool.reserve_b.checked_add(current_amount).unwrap();
            updated_pool.reserve_a = updated_pool.reserve_a.checked_sub(amount_out).unwrap();
        }
        
        Pool::pack(updated_pool, &mut pool_info.data.borrow_mut())?;
        
        // Set up for next hop
        current_amount = amount_out;
        current_input_account = if hop < num_hops - 1 {
            intermediate_account
        } else {
            output_account
        };
    }
    
    // Check minimum output requirement
    if current_amount < minimum_amount_out {
        return Err(ProgramError::InsufficientFunds);
    }
    
    Ok(())
}

// Helper function to calculate output amount for a single swap
fn calculate_swap_output(
    amount_in: u64,
    reserve_in: u64,
    reserve_out: u64,
) -> Result<u64, ProgramError> {
    if amount_in == 0 || reserve_in == 0 || reserve_out == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    
    let amount_in_with_fee = (amount_in as u128).checked_mul(997).ok_or(ProgramError::InvalidArgument)?;
    let numerator = amount_in_with_fee.checked_mul(reserve_out as u128).ok_or(ProgramError::InvalidArgument)?;
    let denominator = (reserve_in as u128)
        .checked_mul(1000).ok_or(ProgramError::InvalidArgument)?
        .checked_add(amount_in_with_fee).ok_or(ProgramError::InvalidArgument)?;
    
    if denominator == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    
    Ok((numerator / denominator) as u64)
}

// Helper function to calculate the expected output amount for a multihop swap
fn calculate_multihop_output(
    initial_amount: u64,
    pools: &[Pool],
    directions: &[bool], // true for A->B, false for B->A
) -> Result<u64, ProgramError> {
    if pools.len() != directions.len() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let mut current_amount = initial_amount;
    
    for (pool, &direction_a_to_b) in pools.iter().zip(directions.iter()) {
        let (reserve_in, reserve_out) = if direction_a_to_b {
            (pool.reserve_a, pool.reserve_b)
        } else {
            (pool.reserve_b, pool.reserve_a)
        };
        
        current_amount = calculate_swap_output(current_amount, reserve_in, reserve_out)?;
    }
    
    Ok(current_amount)
}

// Helper function to determine swap direction based on token addresses
fn determine_swap_direction(
    input_token: &Pubkey,
    pool: &Pool,
) -> Result<bool, ProgramError> {
    if *input_token == pool.token_a {
        Ok(true) // A to B
    } else if *input_token == pool.token_b {
        Ok(false) // B to A
    } else {
        Err(ProgramError::InvalidArgument)
    }
}

// Integer square root implementation for u128
trait IntegerSqrt {
    fn integer_sqrt(self) -> Self;
}

impl IntegerSqrt for u128 {
    fn integer_sqrt(self) -> Self {
        if self < 2 {
            return self;
        }
        let mut x = self;
        let mut y = (self + 1) / 2;
        while y < x {
            x = y;
            y = (x + self / x) / 2;
        }
        x
    }
}