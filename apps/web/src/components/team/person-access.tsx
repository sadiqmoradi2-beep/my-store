'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { FINANCIAL_PERSONNEL_CAPABILITIES, type BranchDto, type TeamPersonDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, ErrorText, Field, Input, Modal, Select } from '@/components/ui';

export interface AccountForm {
  email: string;
  branchId: string;
  capabilities: string[];
}

/** Email + branch + capability checkboxes — the login gets nothing beyond what is ticked here */
export function AccountFields({ value, onChange, withEmail = true }: { value: AccountForm; onChange: (v: AccountForm) => void; withEmail?: boolean }) {
  const t = useTranslations('teamPeople');
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api.get<BranchDto[]>('/branches') });
  const toggle = (cap: string) =>
    onChange({ ...value, capabilities: value.capabilities.includes(cap) ? value.capabilities.filter((c) => c !== cap) : [...value.capabilities, cap] });
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      {withEmail && (
        <Field label={t('email')} hint={t('emailHint')}>
          <Input required type="email" dir="ltr" maxLength={200} value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} />
        </Field>
      )}
      <Field label={t('branch')} hint={t('branchHint')}>
        <Select required value={value.branchId} onChange={(e) => onChange({ ...value, branchId: e.target.value })}>
          <option value="" disabled>
            {t('selectBranch')}
          </option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink">{t('capabilities')}</legend>
        <p className="mb-2 text-xs text-ink-faint">{t('capabilitiesHint')}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {FINANCIAL_PERSONNEL_CAPABILITIES.map((cap) => (
            <label key={cap} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={value.capabilities.includes(cap)} onChange={() => toggle(cap)} />
              {t(`caps.${cap.split('.')[1]}`)}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Store Admin: create / manage the login of one Financial Personnel member */
export function AccessModal({ person, onClose }: { person: TeamPersonDto; onClose: () => void }) {
  const t = useTranslations('teamPeople');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const account = person.account ?? null;
  const [form, setForm] = useState<AccountForm>({
    email: '',
    branchId: account?.branchId ?? '',
    capabilities: account?.capabilities ?? [],
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [linkExisting, setLinkExisting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['team-people'] });

  const save = useMutation({
    mutationFn: () =>
      account
        ? api.patch(`/team-people/${person.id}/account`, { capabilities: form.capabilities, branchId: form.branchId || undefined })
        : linkExisting
          ? api.post(`/team-people/${person.id}/account/link`, { email: form.email })
          : api.post<{ inviteSent: boolean }>(`/team-people/${person.id}/account`, form),
    onSuccess: (r) => {
      refresh();
      if (!account && !linkExisting) setNotice((r as { inviteSent?: boolean })?.inviteSent ? t('inviteSent') : t('inviteFailed'));
      else onClose();
    },
  });
  const toggleLogin = useMutation({
    mutationFn: (enabled: boolean) => api.patch(`/team-people/${person.id}/account`, { loginEnabled: enabled, ...(enabled && account?.managed !== false && { capabilities: form.capabilities }) }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const invite = useMutation({
    mutationFn: () => api.post<{ inviteSent: boolean }>(`/team-people/${person.id}/account/invite`),
    onSuccess: (r) => setNotice(r.inviteSent ? t('inviteSent') : t('inviteFailed')),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal open title={t('accessTitle', { name: person.displayName })} onClose={onClose}>
      {notice ? (
        <div className="space-y-4">
          <p className="text-sm text-ink" role="status">
            {notice}
          </p>
          <Button type="button" onClick={onClose}>
            {tc('close')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {account ? (
            <p className="rounded-lg bg-surface-3 p-2 text-xs text-ink-muted">
              {t('loginOf', { email: account.email })} — {account.loginEnabled ? t('loginOn') : t('loginOff')}
            </p>
          ) : (
            <p className="rounded-lg bg-surface-3 p-2 text-xs text-ink-muted">{t('createAccountHint')}</p>
          )}
          {!account && <label className="flex gap-2 text-sm"><input type="checkbox" checked={linkExisting} onChange={(e) => setLinkExisting(e.target.checked)} />{t('linkExisting')}</label>}
          {!account && linkExisting ? <Field label={t('email')} hint={t('linkExistingHint')}><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            : (!account || (account.loginEnabled && account.managed !== false)) && <AccountFields value={form} onChange={setForm} withEmail={!account} />}
          {account?.managed === false && <p className="text-sm text-ink-muted">{t('linkedExistingHint')}</p>}
          <ErrorText error={save.error ?? toggleLogin.error ?? invite.error} />
          <div className="flex flex-wrap gap-2">
            {(!account || (account.loginEnabled && account.managed !== false)) && (
              <Button type="submit" loading={save.isPending}>
                {account ? t('saveAccess') : linkExisting ? t('linkExisting') : t('createAccount')}
              </Button>
            )}
            {account && (
              <Button type="button" variant="outline" loading={toggleLogin.isPending} onClick={() => toggleLogin.mutate(!account.loginEnabled)}>
                {account.loginEnabled ? t('turnLoginOff') : t('turnLoginOn')}
              </Button>
            )}
            {account?.loginEnabled && (
              <Button type="button" variant="ghost" loading={invite.isPending} onClick={() => invite.mutate()}>
                {t('resendInvite')}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
