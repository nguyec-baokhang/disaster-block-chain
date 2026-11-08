// CrisisSignal on-chain alert registry (Solana Devnet).
// Built and deployed via Solana Playground (beta.solpg.io).

use anchor_lang::prelude::*;

declare_id!("82xaA9hPGxDtdT98EZGTjyjyt1HQaM81nm5MFCzF94hz");

pub const MAX_NAME_LEN: usize = 64;
pub const MAX_ALERT_ID_LEN: usize = 16;

pub const REGISTRY_SEED: &[u8] = b"registry";
pub const AGENCY_SEED: &[u8] = b"agency";
pub const ALERT_SEED: &[u8] = b"alert";

#[program]
pub mod crisis_registry {
    use super::*;

    /// One-time setup. The signer becomes the registry admin.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.admin = ctx.accounts.admin.key();
        registry.bump = ctx.bumps.registry;

        emit!(RegistryInitialized {
            admin: registry.admin,
        });
        Ok(())
    }

    /// Admin registers an agency wallet. The agency itself does not sign.
    pub fn register_agency(ctx: Context<RegisterAgency>, name: String) -> Result<()> {
        require!(!name.is_empty(), RegistryError::NameEmpty);
        require!(name.len() <= MAX_NAME_LEN, RegistryError::NameTooLong);

        let agency = &mut ctx.accounts.agency;
        agency.name = name;
        agency.authority = ctx.accounts.authority.key();
        agency.active = true;
        agency.bump = ctx.bumps.agency;

        emit!(AgencyRegistered {
            agency: agency.key(),
            authority: agency.authority,
            name: agency.name.clone(),
        });
        Ok(())
    }

    /// An active agency records the SHA-256 of a canonical alert.
    pub fn publish_alert(
        ctx: Context<PublishAlert>,
        content_hash: [u8; 32],
        alert_id: String,
    ) -> Result<()> {
        require!(!alert_id.is_empty(), RegistryError::AlertIdEmpty);
        require!(alert_id.len() <= MAX_ALERT_ID_LEN, RegistryError::AlertIdTooLong);

        let alert = &mut ctx.accounts.alert;
        alert.authority = ctx.accounts.authority.key();
        alert.content_hash = content_hash;
        alert.alert_id = alert_id;
        alert.issued_at = Clock::get()?.unix_timestamp;
        alert.status = AlertStatus::Active;
        alert.superseded_by = None;
        alert.bump = ctx.bumps.alert;

        emit!(AlertPublished {
            alert: alert.key(),
            authority: alert.authority,
            content_hash,
            alert_id: alert.alert_id.clone(),
            issued_at: alert.issued_at,
        });
        Ok(())
    }

    /// The issuing agency withdraws an active alert.
    pub fn retract_alert(ctx: Context<RetractAlert>) -> Result<()> {
        let alert = &mut ctx.accounts.alert;
        require!(alert.status == AlertStatus::Active, RegistryError::AlertNotActive);
        alert.status = AlertStatus::Retracted;

        emit!(AlertRetracted {
            alert: alert.key(),
            authority: alert.authority,
            retracted_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// The issuing agency replaces an active alert with another of its own active alerts.
    pub fn supersede_alert(ctx: Context<SupersedeAlert>) -> Result<()> {
        require!(
            ctx.accounts.new_alert.status == AlertStatus::Active,
            RegistryError::NewAlertNotActive
        );

        let new_alert_key = ctx.accounts.new_alert.key();
        let alert = &mut ctx.accounts.alert;
        require!(alert.status == AlertStatus::Active, RegistryError::AlertNotActive);
        alert.status = AlertStatus::Superseded;
        alert.superseded_by = Some(new_alert_key);

        emit!(AlertSuperseded {
            alert: alert.key(),
            new_alert: new_alert_key,
            authority: alert.authority,
            superseded_at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// ---------- Accounts ----------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Registry::INIT_SPACE,
        seeds = [REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, Registry>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterAgency<'info> {
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        has_one = admin @ RegistryError::Unauthorized
    )]
    pub registry: Account<'info, Registry>,
    #[account(
        init,
        payer = admin,
        space = 8 + Agency::INIT_SPACE,
        seeds = [AGENCY_SEED, authority.key().as_ref()],
        bump
    )]
    pub agency: Account<'info, Agency>,
    /// CHECK: the agency's signing wallet. Only its public key is stored; it does not sign here.
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(content_hash: [u8; 32])]
pub struct PublishAlert<'info> {
    #[account(
        seeds = [AGENCY_SEED, authority.key().as_ref()],
        bump = agency.bump,
        has_one = authority @ RegistryError::Unauthorized,
        constraint = agency.active @ RegistryError::AgencyInactive
    )]
    pub agency: Account<'info, Agency>,
    #[account(
        init,
        payer = authority,
        space = 8 + Alert::INIT_SPACE,
        seeds = [ALERT_SEED, authority.key().as_ref(), content_hash.as_ref()],
        bump
    )]
    pub alert: Account<'info, Alert>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RetractAlert<'info> {
    #[account(
        mut,
        seeds = [ALERT_SEED, authority.key().as_ref(), alert.content_hash.as_ref()],
        bump = alert.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub alert: Account<'info, Alert>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SupersedeAlert<'info> {
    #[account(
        mut,
        seeds = [ALERT_SEED, authority.key().as_ref(), alert.content_hash.as_ref()],
        bump = alert.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub alert: Account<'info, Alert>,
    #[account(
        seeds = [ALERT_SEED, authority.key().as_ref(), new_alert.content_hash.as_ref()],
        bump = new_alert.bump,
        has_one = authority @ RegistryError::AgencyMismatch,
        constraint = new_alert.key() != alert.key() @ RegistryError::CannotSupersedeWithSelf
    )]
    pub new_alert: Account<'info, Alert>,
    pub authority: Signer<'info>,
}

// ---------- State ----------

#[account]
#[derive(InitSpace)]
pub struct Registry {
    pub admin: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Agency {
    #[max_len(64)]
    pub name: String,
    pub authority: Pubkey,
    pub active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Alert {
    /// The agency wallet that published this alert (also a PDA seed).
    pub authority: Pubkey,
    pub content_hash: [u8; 32],
    #[max_len(16)]
    pub alert_id: String,
    pub issued_at: i64,
    pub status: AlertStatus,
    pub superseded_by: Option<Pubkey>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AlertStatus {
    Active,
    Retracted,
    Superseded,
}

// ---------- Events ----------

#[event]
pub struct RegistryInitialized {
    pub admin: Pubkey,
}

#[event]
pub struct AgencyRegistered {
    pub agency: Pubkey,
    pub authority: Pubkey,
    pub name: String,
}

#[event]
pub struct AlertPublished {
    pub alert: Pubkey,
    pub authority: Pubkey,
    pub content_hash: [u8; 32],
    pub alert_id: String,
    pub issued_at: i64,
}

#[event]
pub struct AlertRetracted {
    pub alert: Pubkey,
    pub authority: Pubkey,
    pub retracted_at: i64,
}

#[event]
pub struct AlertSuperseded {
    pub alert: Pubkey,
    pub new_alert: Pubkey,
    pub authority: Pubkey,
    pub superseded_at: i64,
}

// ---------- Errors ----------

#[error_code]
pub enum RegistryError {
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("Agency name must not be empty")]
    NameEmpty,
    #[msg("Agency name exceeds 64 bytes")]
    NameTooLong,
    #[msg("Alert ID must not be empty")]
    AlertIdEmpty,
    #[msg("Alert ID exceeds 16 bytes")]
    AlertIdTooLong,
    #[msg("Agency is not active")]
    AgencyInactive,
    #[msg("Alert is not active")]
    AlertNotActive,
    #[msg("Replacement alert is not active")]
    NewAlertNotActive,
    #[msg("Replacement alert belongs to a different agency")]
    AgencyMismatch,
    #[msg("An alert cannot supersede itself")]
    CannotSupersedeWithSelf,
}
