import { useEffect, useState } from 'react';
import { useAuth, useUser } from '../lib/auth';
import { formatDate } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Card, CardTitle, Row } from '../components/Card';
import { Button } from '../components/Button';
import { KycBadge } from '../components/Badge';
import { BankAccountForm, KycForm } from '../components/ProfileForms';
import { Banner } from '../components/Banner';
import { LogoutIcon } from '../components/icons';

export function ProfilePage() {
  const user = useUser();
  const { setUser, reloadUser, logout } = useAuth();
  const [editingBank, setEditingBank] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void reloadUser();
  }, [reloadUser]);

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" backTo="/" />

      {saved && <Banner tone="success">{saved}</Banner>}

      <Card>
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-900 text-xl font-semibold text-amber-300">
            {user.email.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{user.kycName ?? user.email}</p>
            <p className="truncate text-sm text-stone-500">{user.email}</p>
            <p className="text-xs text-stone-400">Member since {formatDate(user.createdAt)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle action={<KycBadge status={user.kycStatus} />}>Identity (KYC)</CardTitle>
        {user.kycStatus === 'VERIFIED' ? (
          <dl>
            <Row label="Verified name" value={user.kycName ?? '—'} />
          </dl>
        ) : (
          <>
            <p className="mb-4 text-sm text-stone-500">
              Verify your identity to sell gold and lift the purchase limit. In this prototype verification is approved
              instantly.
            </p>
            <KycForm
              onDone={(me) => {
                setUser(me);
                setSaved('Identity verified.');
              }}
            />
          </>
        )}
      </Card>

      <Card>
        <CardTitle
          action={
            user.bankAccount && !editingBank ? (
              <Button size="sm" variant="ghost" onClick={() => setEditingBank(true)}>
                Replace
              </Button>
            ) : undefined
          }
        >
          Bank account
        </CardTitle>
        {user.bankAccount && !editingBank ? (
          <dl>
            <Row label="Account holder" value={user.bankAccount.holderName} />
            <Row label="IBAN" value={<span className="font-mono">{user.bankAccount.ibanMasked}</span>} />
          </dl>
        ) : (
          <>
            {!user.bankAccount && <p className="mb-4 text-sm text-stone-500">Sale proceeds are paid to this account.</p>}
            <BankAccountForm
              defaultHolder={user.bankAccount?.holderName ?? user.kycName ?? ''}
              submitLabel={user.bankAccount ? 'Replace bank account' : 'Save bank account'}
              onCancel={user.bankAccount ? () => setEditingBank(false) : undefined}
              onDone={(me) => {
                setUser(me);
                setEditingBank(false);
                setSaved('Bank account saved.');
              }}
            />
          </>
        )}
      </Card>

      <Button
        variant="secondary"
        fullWidth
        size="lg"
        loading={loggingOut}
        onClick={() => {
          setLoggingOut(true);
          void logout();
        }}
      >
        <LogoutIcon className="h-5 w-5" /> Log out
      </Button>
    </div>
  );
}
