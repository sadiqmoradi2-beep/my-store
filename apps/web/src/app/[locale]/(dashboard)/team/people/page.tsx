'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { PERMISSIONS, type TeamPersonDto } from '@my-store/shared';
import { useFinancialActor } from '@/components/income/financial-actor-field';
import { api } from '@/lib/api-client';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Spinner } from '@/components/ui';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useAuthStore } from '@/stores/auth-store';
import { AccessModal, AccountFields, type AccountForm } from '@/components/team/person-access';

/** Team → Financial Personnel: register people who are neither employees nor partners */
export default function TeamPeoplePage() {
  const t = useTranslations('teamPeople');
  const tc = useTranslations('common');
  const allowed = useRequirePermission(PERMISSIONS.EMPLOYEES_READ);
  const isAdmin = useFinancialActor().data?.canSelectActor === true;
  const hasManagePermission = !!useAuthStore((s) => s.user?.permissions?.includes(PERMISSIONS.EMPLOYEES_MANAGE));
  const canManage = isAdmin && hasManagePermission;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TeamPersonDto | 'new' | null>(null);
  // Delete is shown to the Store Admin only; the server re-checks the real built-in Admin role
  const [deleting, setDeleting] = useState<TeamPersonDto | null>(null);
  const [access, setAccess] = useState<TeamPersonDto | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['team-people'],
    queryFn: () => api.get<TeamPersonDto[]>('/team-people'),
    enabled: allowed,
  });
  const toggle = useMutation({
    mutationFn: (p: TeamPersonDto) => api.patch(`/team-people/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-people'] });
      queryClient.invalidateQueries({ queryKey: ['people-directory'] });
    },
  });

  if (!allowed) return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t('hint')}</p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('add')}
          </Button>
        )}
      </div>
      <ErrorText error={error} />
      <ErrorText error={toggle.error} />
      {isPending ? (
        <Spinner />
      ) : data?.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-faint">{t('empty')}</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="p-3 text-start font-medium">{t('name')}</th>
                <th className="p-3 text-start font-medium">{t('notes')}</th>
                {isAdmin && <th className="p-3 text-start font-medium">{t('login')}</th>}
                <th className="p-3 text-start font-medium" />
                <th className="p-3 text-start font-medium" />
              </tr>
            </thead>
            <tbody>
              {data?.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3 font-semibold text-ink">{p.displayName}</td>
                  <td className="p-3 text-ink-muted">{p.notes ?? '—'}</td>
                  {isAdmin && (
                    <td className="p-3 text-xs text-ink-muted">
                      {p.account ? (
                        <>
                          <span className="block text-ink" dir="ltr">
                            {p.account.email}
                          </span>
                          <Badge tone={p.account.loginEnabled ? 'DELIVERED' : 'neutral'}>{p.account.loginEnabled ? t('loginOn') : t('loginOff')}</Badge>{' '}
                          {p.account.branchName && <span>{p.account.branchName} · </span>}
                          {p.account.managed === false ? t('existingRolePermissions') : p.account.capabilities.length
                            ? p.account.capabilities.map((c) => t(`caps.${c.split('.')[1]}`)).join(', ')
                            : t('noCapabilities')}
                        </>
                      ) : (
                        t('noLogin')
                      )}
                    </td>
                  )}
                  <td className="p-3">
                    {p.archivedAt ? (
                      <Badge tone="danger">{t('archived')}</Badge>
                    ) : (
                      <Badge tone={p.isActive ? 'DELIVERED' : 'neutral'}>{p.isActive ? t('active') : t('inactive')}</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {canManage && !p.archivedAt && (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setEditing(p)} aria-label={t('edit')} className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-surface-3 hover:text-ink">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          title={p.isActive ? t('deactivateHint') : undefined}
                          loading={toggle.isPending && toggle.variables?.id === p.id}
                          onClick={() => toggle.mutate(p)}
                        >
                          {p.isActive ? t('deactivate') : t('activate')}
                        </Button>
                        {isAdmin && (
                          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setAccess(p)}>
                            <KeyRound className="h-3.5 w-3.5" aria-hidden />
                            {t('access')}
                          </Button>
                        )}
                        {isAdmin && (
                          <Button type="button" variant="ghost" className="h-8 px-2 text-xs text-red-600 dark:text-red-400" onClick={() => setDeleting(p)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            {t('delete')}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {editing && <PersonModal person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteModal person={deleting} onClose={() => setDeleting(null)} />}
      {access && <AccessModal person={access} onClose={() => setAccess(null)} />}
    </div>
  );
}

/** Confirm, then delete: the server removes an unreferenced person, or archives one named in financial history */
function DeleteModal({ person, onClose }: { person: TeamPersonDto; onClose: () => void }) {
  const t = useTranslations('teamPeople');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{ result: 'DELETED' | 'ARCHIVED'; references: { transactions: number; transfers: number } | null } | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.delete<{ result: 'DELETED' | 'ARCHIVED'; references: { transactions: number; transfers: number } | null }>(`/team-people/${person.id}`),
    onSuccess: (r) => {
      setResult(r);
      queryClient.invalidateQueries({ queryKey: ['team-people'] });
      queryClient.invalidateQueries({ queryKey: ['people-directory'] });
    },
  });
  return (
    <Modal open title={t('deleteTitle', { name: person.displayName })} onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <p className="text-sm text-ink" role="status">
            {result.result === 'DELETED'
              ? t('deletedDone', { name: person.displayName })
              : t('archivedDone', {
                  name: person.displayName,
                  transactions: result.references?.transactions ?? 0,
                  transfers: result.references?.transfers ?? 0,
                })}
          </p>
          <Button type="button" onClick={onClose}>
            {tc('close')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">{t('deleteExplain', { name: person.displayName })}</p>
          <ErrorText error={mutation.error} />
          <div className="flex gap-2">
            <Button type="button" className="bg-red-600 hover:bg-red-700" loading={mutation.isPending} onClick={() => mutation.mutate()}>
              {t('deleteConfirm')}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc('cancel')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PersonModal({ person, onClose }: { person: TeamPersonDto | null; onClose: () => void }) {
  const t = useTranslations('teamPeople');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(person?.displayName ?? '');
  const [notes, setNotes] = useState(person?.notes ?? '');
  // "Create Account" (Store Admin only): a login through the existing email invite, no password shown to anyone
  const isAdmin = useFinancialActor().data?.canSelectActor === true;
  const [createAccount, setCreateAccount] = useState(false);
  const [account, setAccount] = useState<AccountForm>({ email: '', branchId: '', capabilities: [] });
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      person
        ? api.patch(`/team-people/${person.id}`, { displayName, notes })
        : api.post<{ inviteSent?: boolean }>('/team-people', { displayName, notes: notes || undefined, ...(createAccount && { account }) }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['team-people'] });
      queryClient.invalidateQueries({ queryKey: ['people-directory'] });
      if (!person && createAccount) setInviteNotice((r as { inviteSent?: boolean })?.inviteSent ? t('inviteSent') : t('inviteFailed'));
      else onClose();
    },
  });
  if (inviteNotice) {
    return (
      <Modal open title={t('add')} onClose={onClose}>
        <p className="text-sm text-ink" role="status">
          {inviteNotice}
        </p>
        <Button type="button" className="mt-4" onClick={onClose}>
          {tc('close')}
        </Button>
      </Modal>
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }
  return (
    <Modal open title={person ? t('edit') : t('add')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('name')}>
          <Input required minLength={2} maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t('notes')}>
          <Input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {!person && isAdmin && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} />
            {t('createAccount')}
          </label>
        )}
        {!person && createAccount && (
          <>
            <p className="text-xs text-ink-faint">{t('createAccountHint')}</p>
            <AccountFields value={account} onChange={setAccount} />
          </>
        )}
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {tc('save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
