'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { PERMISSIONS, type TeamPersonDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Spinner } from '@/components/ui';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useAuthStore } from '@/stores/auth-store';

/** Team → People: register people who are neither employees nor partners */
export default function TeamPeoplePage() {
  const t = useTranslations('teamPeople');
  const tc = useTranslations('common');
  const allowed = useRequirePermission(PERMISSIONS.EMPLOYEES_READ);
  const canManage = !!useAuthStore((s) => s.user?.permissions?.includes(PERMISSIONS.EMPLOYEES_MANAGE));
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TeamPersonDto | 'new' | null>(null);

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
                <th className="p-3 text-start font-medium" />
                <th className="p-3 text-start font-medium" />
              </tr>
            </thead>
            <tbody>
              {data?.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3 font-semibold text-ink">{p.displayName}</td>
                  <td className="p-3 text-ink-muted">{p.notes ?? '—'}</td>
                  <td className="p-3">
                    <Badge tone={p.isActive ? 'DELIVERED' : 'neutral'}>{p.isActive ? t('active') : t('inactive')}</Badge>
                  </td>
                  <td className="p-3">
                    {canManage && (
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
    </div>
  );
}

function PersonModal({ person, onClose }: { person: TeamPersonDto | null; onClose: () => void }) {
  const t = useTranslations('teamPeople');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(person?.displayName ?? '');
  const [notes, setNotes] = useState(person?.notes ?? '');
  const mutation = useMutation({
    mutationFn: () =>
      person
        ? api.patch(`/team-people/${person.id}`, { displayName, notes })
        : api.post('/team-people', { displayName, notes: notes || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-people'] });
      queryClient.invalidateQueries({ queryKey: ['people-directory'] });
      onClose();
    },
  });
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
