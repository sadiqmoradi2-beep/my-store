'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { DirectoryPersonDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { ErrorText, Field, Input, Select } from '@/components/ui';

export interface ActorContext {
  canSelectActor: boolean;
  actor: { id: string; name: string } | null;
  operatorName: string;
  branchId: string | null;
}

export function useFinancialActor() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({ queryKey: ['financial-actor-context', userId], queryFn: () => api.get<ActorContext>('/team-people/actor-context'), staleTime: 0 });
}

export function FinancialActorField({ context, error, label, value, onChange, directory, branchId }: {
  context?: ActorContext; error: unknown; label: string; value: string; onChange: (id: string) => void; directory?: DirectoryPersonDto[]; branchId: string;
}) {
  const t = useTranslations('cash');
  const options = (directory ?? []).filter((p) => p.kind === 'PERSON' && p.actorEligible !== false && (!p.branchId || p.branchId === branchId));
  return <Field label={label}>
    {context?.canSelectActor ? <Select required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{t('selectPerson')}</option>
      {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </Select> : <Input readOnly value={context?.actor?.name ?? context?.operatorName ?? ''} />}
    <ErrorText error={error} />
  </Field>;
}
