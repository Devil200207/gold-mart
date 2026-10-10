import { useState, type FormEvent } from 'react';
import { api, type Me } from '../lib/api';
import { useAction } from '../lib/hooks';
import { Button } from './Button';
import { Input } from './Input';
import { Banner } from './Banner';

/** Mock KYC form (POST /me/kyc). Auto-approved by the prototype API. */
export function KycForm({ onDone, defaultName = '' }: { onDone(me: Me): void; defaultName?: string }) {
  const [fullName, setFullName] = useState(defaultName);
  const [idNumber, setIdNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [touched, setTouched] = useState(false);
  const submit = useAction(async (key) => {
    const me = await api.submitKyc(
      { fullName: fullName.trim(), idNumber: idNumber.trim(), dateOfBirth },
      key,
    );
    onDone(me);
  });

  const errors = {
    fullName: fullName.trim().length < 2 ? 'Enter your full legal name' : null,
    idNumber: idNumber.trim().length < 4 ? 'Enter your ID / passport number' : null,
    dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? null : 'Enter your date of birth',
  };
  const valid = !errors.fullName && !errors.idNumber && !errors.dateOfBirth;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    void submit.run();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input
        label="Full name"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={touched ? errors.fullName : null}
      />
      <Input
        label="ID number"
        value={idNumber}
        onChange={(e) => setIdNumber(e.target.value)}
        error={touched ? errors.idNumber : null}
        hint="Emirates ID or passport number (mock verification)"
      />
      <Input
        label="Date of birth"
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        error={touched ? errors.dateOfBirth : null}
      />
      {submit.error && <Banner tone="error">{submit.error.message}</Banner>}
      <Button type="submit" fullWidth loading={submit.pending}>
        Verify identity
      </Button>
    </form>
  );
}

/** Mock bank account form (POST /me/bank-account). */
export function BankAccountForm({
  onDone,
  defaultHolder = '',
  submitLabel = 'Save bank account',
  onCancel,
}: {
  onDone(me: Me): void;
  defaultHolder?: string;
  submitLabel?: string;
  onCancel?(): void;
}) {
  const [holderName, setHolderName] = useState(defaultHolder);
  const [iban, setIban] = useState('');
  const [touched, setTouched] = useState(false);
  const normalizedIban = iban.replace(/\s+/g, '').toUpperCase();
  const submit = useAction(async (key) => {
    const me = await api.saveBankAccount({ holderName: holderName.trim(), iban: normalizedIban }, key);
    onDone(me);
  });

  const errors = {
    holderName: holderName.trim().length < 2 ? 'Enter the account holder name' : null,
    iban: /^[A-Z0-9]{8,34}$/.test(normalizedIban) ? null : 'Enter a valid IBAN (8–34 letters and digits), e.g. AE070331234567890123456',
  };
  const valid = !errors.holderName && !errors.iban;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    void submit.run();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input
        label="Account holder"
        autoComplete="name"
        value={holderName}
        onChange={(e) => setHolderName(e.target.value)}
        error={touched ? errors.holderName : null}
      />
      <Input
        label="IBAN"
        autoCapitalize="characters"
        spellCheck={false}
        value={iban}
        onChange={(e) => setIban(e.target.value)}
        error={touched ? errors.iban : null}
        className="font-mono"
      />
      <p className="text-xs text-stone-500">
        Demo tip: an IBAN ending in <span className="font-mono font-semibold">0000</span> simulates a failed payout, so you can
        see the gold returned automatically.
      </p>
      {submit.error && <Banner tone="error">{submit.error.message}</Banner>}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submit.pending} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submit.pending} className="flex-1" fullWidth={!onCancel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
