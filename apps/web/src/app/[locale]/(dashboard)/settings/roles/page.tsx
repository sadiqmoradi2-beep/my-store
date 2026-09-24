'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormEvent, useMemo, useState } from 'react';
import type { PermissionDto, RoleDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { Badge, Button, Card, ErrorText, Field, Input, Modal, Spinner } from '@/components/ui';

export default function RolesPage() {
  const t = useTranslations('roles');
  const tc = useTranslations('common');

  const [editing, setEditing] = useState<RoleDto | null | 'new'>(null);

  const { data: roles, isPending, error } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleDto[]>('/roles'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
  });
  const queryClient = useQueryClient();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">{t('title')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('hint')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('new')}
        </Button>
      </div>

      <ErrorText error={error} />
      <ErrorText error={removeMutation.error} />

      {isPending ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles?.map((role) => (
            <Card key={role.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-ink">{role.name}</p>
                  <p className="text-xs text-ink-faint" dir="ltr">
                    {role.key}
                  </p>
                </div>
                {role.isSystem ? (
                  <Badge tone="neutral">{t('system')}</Badge>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing(role)}
                      className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-surface-3 hover:text-ink"
                      aria-label={tc('edit')}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => {
                        if (role.userCount > 0) return;
                        if (confirm(t('deleteConfirm'))) removeMutation.mutate(role.id);
                      }}
                      disabled={role.userCount > 0}
                      className="cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-900/30"
                      aria-label={tc('delete')}
                      title={role.userCount > 0 ? t('cannotDeleteInUse') : undefined}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-ink-muted">
                {t('userCount', { count: formatNumber(role.userCount) })} ·{' '}
                {t('permissionCount', { count: formatNumber(role.permissions.length) })}
              </p>
            </Card>
          ))}
        </div>
      )}

      {editing !== null && (
        <RoleModal
          role={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['roles'] });
          }}
        />
      )}
    </div>
  );
}

function RoleModal({ role, onClose }: { role: RoleDto | null; onClose: () => void }) {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const [key, setKey] = useState(role?.key ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));

  const { data: permissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<PermissionDto[]>('/roles/permissions'),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of permissions ?? []) {
      const list = map.get(p.moduleKey) ?? [];
      list.push(p);
      map.set(p.moduleKey, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const toggle = (permKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permKey)) next.delete(permKey);
      else next.add(permKey);
      return next;
    });
  };

  const toggleModule = (modulePerms: PermissionDto[], allChecked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of modulePerms) {
        if (allChecked) next.delete(p.key);
        else next.add(p.key);
      }
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const permissionKeys = [...selected];
      return role
        ? api.patch(`/roles/${role.id}`, { name, permissionKeys })
        : api.post('/roles', { key: key.toUpperCase().replace(/[^A-Z0-9_]/g, '_'), name, permissionKeys });
    },
    onSuccess: onClose,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={role ? `${tc('edit')}: ${role.name}` : t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('name')}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {!role && (
          <Field label={t('key')} hint={t('keyHint')}>
            <Input required dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} placeholder="STORE_SUPERVISOR" />
          </Field>
        )}
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t('permissions')}</p>
          <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
            {grouped.map(([moduleKey, modulePerms]) => {
              const allChecked = modulePerms.every((p) => selected.has(p.key));
              return (
                <div key={moduleKey} className="border-b border-line/60 pb-2 last:border-0 last:pb-0">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() => toggleModule(modulePerms, allChecked)}
                      className="h-4 w-4 cursor-pointer accent-primary-600"
                    />
                    {moduleKey}
                  </label>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 ps-6 sm:grid-cols-3">
                    {modulePerms.map((p) => (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(p.key)}
                          onChange={() => toggle(p.key)}
                          className="h-3.5 w-3.5 cursor-pointer accent-primary-600"
                        />
                        <span dir="ltr">{p.key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending} disabled={selected.size === 0}>
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
