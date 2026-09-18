"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APAC_BANK_PROFILES,
  BENEFICIARY_RELATIONSHIPS,
  BENEFICIARY_TYPES,
  SUPPORTED_CHAIN_NETWORKS,
  WALLET_TYPES,
} from "@/components/wallet-destinations/destination-data";

/**
 * Add Destination — UI Phase 2E. Fields derive EXACTLY from the two governed public registration
 * request schemas, verified against the actual backend source this turn (`RegisterWalletDestinationBody`
 * in `routes/public/wallet-destinations.ts`; `RegisterFiatPayoutDestinationBody` in
 * `routes/public/payout-destinations.ts`) — no field invented. `account_identifier_type` ("local_account")
 * and `bank_identifier_type` ("bic") are fixed literals in that schema, not user choices, so they
 * are not rendered as fields at all. Currency and rail are never independently selectable — the
 * schema requires them to exactly match the chosen country's frozen profile
 * (`WLT1_ACCOUNT_IDENTIFIER_INVALID` / "currency_rail_country_mismatch" otherwise) — shown here as
 * derived, read-only text the moment a country is chosen, never a second Select a user could
 * mismatch.
 *
 * **No API integration this turn** (`UI-04` §35's Phase 2E scope — UI-first, backend deferred).
 * The dialog progresses `form` → `review`, matching "review-before-submit" — but the review step
 * explicitly discloses that nothing is submitted; there is no third "success" state, since no
 * request is ever actually sent. Final action reads "Review Destination," not "Submit," exactly
 * per this turn's own instruction; the review step's own action reads "Close," never "Confirm" or
 * anything implying a completed transaction.
 *
 * `Idempotency-Key` (a real, required header on both governed registration routes) is
 * intentionally NOT generated or shown here — it is a wire-protocol concern of the future API-
 * integration turn, not a form field a client user would ever see or enter.
 */

type DestinationKind = "wallet" | "fiat_payout";
type Step = "form" | "review";

interface WalletFormState {
  chainNetwork: string;
  address: string;
  memoTag: string;
  walletType: string;
  beneficiaryRelationship: string;
}

interface FiatFormState {
  beneficiaryType: string;
  accountIdentifier: string;
  bankIdentifier: string;
  branchIdentifier: string;
  bankCountry: string;
}

const EMPTY_WALLET_FORM: WalletFormState = {
  chainNetwork: "",
  address: "",
  memoTag: "",
  walletType: "",
  beneficiaryRelationship: "",
};

const EMPTY_FIAT_FORM: FiatFormState = {
  beneficiaryType: "",
  accountIdentifier: "",
  bankIdentifier: "",
  branchIdentifier: "",
  bankCountry: "",
};

function isWalletFormComplete(f: WalletFormState): boolean {
  return Boolean(f.chainNetwork && f.address && f.walletType && f.beneficiaryRelationship);
}

function isFiatFormComplete(f: FiatFormState, branchRequired: boolean): boolean {
  return Boolean(
    f.beneficiaryType &&
      f.accountIdentifier &&
      f.bankIdentifier &&
      f.bankCountry &&
      (!branchRequired || f.branchIdentifier),
  );
}

export function AddDestinationDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DestinationKind>("wallet");
  const [step, setStep] = useState<Step>("form");
  const [walletForm, setWalletForm] = useState<WalletFormState>(EMPTY_WALLET_FORM);
  const [fiatForm, setFiatForm] = useState<FiatFormState>(EMPTY_FIAT_FORM);

  const fiatProfile = APAC_BANK_PROFILES.find((p) => p.country === fiatForm.bankCountry);
  const branchRequired = fiatProfile?.branchRequired ?? false;

  function reset() {
    setStep("form");
    setKind("wallet");
    setWalletForm(EMPTY_WALLET_FORM);
    setFiatForm(EMPTY_FIAT_FORM);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  const canReview =
    kind === "wallet" ? isWalletFormComplete(walletForm) : isFiatFormComplete(fiatForm, branchRequired);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="h-10 gap-2">
          <Plus className="size-4" aria-hidden="true" />
          Add Destination
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Add Destination</DialogTitle>
              <DialogDescription>
                Register a governed payout destination. It must pass screening and approval
                before it becomes active.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-5">
              <div className="flex gap-2" role="radiogroup" aria-label="Destination category">
                <Button
                  type="button"
                  variant={kind === "wallet" ? "default" : "outline"}
                  aria-pressed={kind === "wallet"}
                  className="h-10 flex-1"
                  onClick={() => setKind("wallet")}
                >
                  Wallet
                </Button>
                <Button
                  type="button"
                  variant={kind === "fiat_payout" ? "default" : "outline"}
                  aria-pressed={kind === "fiat_payout"}
                  className="h-10 flex-1"
                  onClick={() => setKind("fiat_payout")}
                >
                  Bank Payout
                </Button>
              </div>

              {kind === "wallet" ? (
                <WalletFields value={walletForm} onChange={setWalletForm} />
              ) : (
                <FiatFields value={fiatForm} onChange={setFiatForm} branchRequired={branchRequired} />
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="h-10">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                className="h-10"
                disabled={!canReview}
                onClick={() => setStep("review")}
              >
                Review Destination
              </Button>
            </DialogFooter>
          </>
        ) : (
          <ReviewStep
            kind={kind}
            walletForm={walletForm}
            fiatForm={fiatForm}
            fiatProfile={fiatProfile}
            onBack={() => setStep("form")}
            onClose={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
      {children}
      {required && (
        <span className="text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </Label>
  );
}

function WalletFields({
  value,
  onChange,
}: {
  value: WalletFormState;
  onChange: (next: WalletFormState) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="chain-network" required>
          Chain / Network
        </FieldLabel>
        <Select value={value.chainNetwork} onValueChange={(v) => onChange({ ...value, chainNetwork: v })}>
          <SelectTrigger id="chain-network" aria-required="true" className="h-10 w-full">
            <SelectValue placeholder="Select chain and network" />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CHAIN_NETWORKS.map((cn) => (
              <SelectItem key={`${cn.chain}/${cn.network}`} value={`${cn.chain}/${cn.network}`}>
                {cn.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="address" required>
          Address
        </FieldLabel>
        <Input
          id="address"
          aria-required="true"
          className="h-10"
          placeholder="e.g. 0x71C7656EC7ab88b098defB751B7401B5f6d8976"
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          The receiving address, exactly as issued by the wallet or custodian.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="memo-tag">Memo / Tag (optional)</FieldLabel>
        <Input
          id="memo-tag"
          className="h-10"
          value={value.memoTag}
          onChange={(e) => onChange({ ...value, memoTag: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="wallet-type" required>
          Wallet type
        </FieldLabel>
        <Select value={value.walletType} onValueChange={(v) => onChange({ ...value, walletType: v })}>
          <SelectTrigger id="wallet-type" aria-required="true" className="h-10 w-full">
            <SelectValue placeholder="Select wallet type" />
          </SelectTrigger>
          <SelectContent>
            {WALLET_TYPES.map((w) => (
              <SelectItem key={w.value} value={w.value}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="beneficiary-relationship" required>
          Relationship to beneficiary
        </FieldLabel>
        <Select
          value={value.beneficiaryRelationship}
          onValueChange={(v) => onChange({ ...value, beneficiaryRelationship: v })}
        >
          <SelectTrigger id="beneficiary-relationship" aria-required="true" className="h-10 w-full">
            <SelectValue placeholder="Select relationship" />
          </SelectTrigger>
          <SelectContent>
            {BENEFICIARY_RELATIONSHIPS.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function FiatFields({
  value,
  onChange,
  branchRequired,
}: {
  value: FiatFormState;
  onChange: (next: FiatFormState) => void;
  branchRequired: boolean;
}) {
  const profile = APAC_BANK_PROFILES.find((p) => p.country === value.bankCountry);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="bank-country" required>
          Bank country
        </FieldLabel>
        <Select
          value={value.bankCountry}
          onValueChange={(v) => onChange({ ...value, bankCountry: v, branchIdentifier: "" })}
        >
          <SelectTrigger id="bank-country" aria-required="true" className="h-10 w-full">
            <SelectValue placeholder="Select bank country" />
          </SelectTrigger>
          <SelectContent>
            {APAC_BANK_PROFILES.map((p) => (
              <SelectItem key={p.country} value={p.country}>
                {p.countryLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {profile && (
          <p className="text-xs text-muted-foreground">
            Currency and payout rail are fixed by country: {profile.currency}, {profile.rail}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="beneficiary-type" required>
          Beneficiary type
        </FieldLabel>
        <Select value={value.beneficiaryType} onValueChange={(v) => onChange({ ...value, beneficiaryType: v })}>
          <SelectTrigger id="beneficiary-type" aria-required="true" className="h-10 w-full">
            <SelectValue placeholder="Select beneficiary type" />
          </SelectTrigger>
          <SelectContent>
            {BENEFICIARY_TYPES.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="account-identifier" required>
          Account number
        </FieldLabel>
        <Input
          id="account-identifier"
          aria-required="true"
          className="h-10"
          value={value.accountIdentifier}
          onChange={(e) => onChange({ ...value, accountIdentifier: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="bank-identifier" required>
          Bank identifier (BIC)
        </FieldLabel>
        <Input
          id="bank-identifier"
          aria-required="true"
          className="h-10"
          value={value.bankIdentifier}
          onChange={(e) => onChange({ ...value, bankIdentifier: e.target.value })}
        />
      </div>

      {branchRequired && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="branch-identifier" required>
            Branch code
          </FieldLabel>
          <Input
            id="branch-identifier"
            aria-required="true"
            className="h-10"
            value={value.branchIdentifier}
            onChange={(e) => onChange({ ...value, branchIdentifier: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Required for this country.</p>
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  kind,
  walletForm,
  fiatForm,
  fiatProfile,
  onBack,
  onClose,
}: {
  kind: DestinationKind;
  walletForm: WalletFormState;
  fiatForm: FiatFormState;
  fiatProfile: (typeof APAC_BANK_PROFILES)[number] | undefined;
  onBack: () => void;
  onClose: () => void;
}) {
  const chainNetworkLabel = SUPPORTED_CHAIN_NETWORKS.find(
    (cn) => `${cn.chain}/${cn.network}` === walletForm.chainNetwork,
  )?.label;
  const walletTypeLabel = WALLET_TYPES.find((w) => w.value === walletForm.walletType)?.label;
  const relationshipLabel = BENEFICIARY_RELATIONSHIPS.find(
    (b) => b.value === walletForm.beneficiaryRelationship,
  )?.label;
  const beneficiaryTypeLabel = BENEFICIARY_TYPES.find((b) => b.value === fiatForm.beneficiaryType)?.label;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Review Destination</DialogTitle>
        <DialogDescription>
          Interface preview — demo data. This does not submit a real registration request;
          backend integration is separate, later work.
        </DialogDescription>
      </DialogHeader>

      <dl className="flex flex-col gap-3">
        {kind === "wallet" ? (
          <>
            <ReviewRow label="Category">Wallet</ReviewRow>
            <ReviewRow label="Chain / Network">{chainNetworkLabel}</ReviewRow>
            <ReviewRow label="Address">{walletForm.address}</ReviewRow>
            {walletForm.memoTag && <ReviewRow label="Memo / Tag">{walletForm.memoTag}</ReviewRow>}
            <ReviewRow label="Wallet type">{walletTypeLabel}</ReviewRow>
            <ReviewRow label="Relationship">{relationshipLabel}</ReviewRow>
          </>
        ) : (
          <>
            <ReviewRow label="Category">Bank Payout</ReviewRow>
            <ReviewRow label="Country">{fiatProfile?.countryLabel}</ReviewRow>
            <ReviewRow label="Currency / Rail">
              {fiatProfile ? `${fiatProfile.currency} · ${fiatProfile.rail}` : ""}
            </ReviewRow>
            <ReviewRow label="Beneficiary type">{beneficiaryTypeLabel}</ReviewRow>
            <ReviewRow label="Account number">{fiatForm.accountIdentifier}</ReviewRow>
            <ReviewRow label="Bank identifier">{fiatForm.bankIdentifier}</ReviewRow>
            {fiatForm.branchIdentifier && <ReviewRow label="Branch">{fiatForm.branchIdentifier}</ReviewRow>}
          </>
        )}
      </dl>

      <DialogFooter>
        <Button type="button" variant="ghost" className="h-10" onClick={onBack}>
          Back
        </Button>
        <Button type="button" className="h-10" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}
