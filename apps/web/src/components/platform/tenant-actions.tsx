'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Pause, Play, RefreshCw, Trash2, Unlock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { PLANS, type TenantDetailDto } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { Button, Card, ErrorText, Field, Input, Modal, Select } from '@/components/ui';

type PlanCode = (typeof PLANS)[number]['code'];

/** Platform admin controls for one store: access, plan and permanent delete */
export function TenantActions({ tenant }: { tenant: TenantDetailDto }) {
  const t = useTranslations('platformAdmin.actions');
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'plan' | 'delete' | null>(null);

  const refresh = (data: TenantDetailDto) => {
    queryClient.setQueryData(['platform-admin', 'tenant', tenant.id], data);
    queryClient.invalidateQueries({ queryKey: ['platform-admin', 'tenants'] });
  };
  const access = useMutation({
    mutationFn: (active: boolean) => api.patch<TenantDetailDto>(`/tenants/${tenant.id}/access`, { active }),
    onSuccess: refresh,
  });
  const planToggle = useMutation({
    mutationFn: (op: 'stop' | 'resume') => api.post<TenantDetailDto>(`/tenants/${tenant.id}/plan/${op}`, {}),
    onSuccess: refresh,
  });
  const stopped = tenant.subscription?.status === 'CANCELLED';

  return (
    <Card className="space-y-4 p-5">
      <p className="text-sm font-semibold text-ink">{t('title')}</p>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('accessSection')}</p>
        <p className="text-xs text-ink-muted">{tenant.isActive ? t('suspendHint') : t('restoreHint')}</p>
        {tenant.isActive ? (
          <Button
            variant="outline"
            loading={access.isPending}
            onClick={() => confirm(t('suspendConfirm', { name: tenant.name })) && access.mutate(false)}
          >
            <Ban className="h-4 w-4" aria-hidden />
            {t('suspend')}
          </Button>
        ) : (
          <Button loading={access.isPending} onClick={() => access.mutate(true)}>
            <Unlock className="h-4 w-4" aria-hidden />
            {t('restore')}
          </Button>
        )}
        <ErrorText error={access.error} />
      </div>

      {tenant.subscription && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('planSection')}</p>
          <p className="text-xs text-ink-muted">{stopped ? t('resumeHint') : t('stopHint')}</p>
          <div className="flex flex-wrap gap-2">
            {stopped ? (
              <Button loading={planToggle.isPending} onClick={() => planToggle.mutate('resume')}>
                <Play className="h-4 w-4" aria-hidden />
                {t('resume')}
              </Button>
            ) : (
              <Button
                variant="outline"
                loading={planToggle.isPending}
                onClick={() => confirm(t('stopConfirm', { name: tenant.name })) && planToggle.mutate('stop')}
              >
                <Pause className="h-4 w-4" aria-hidden />
                {t('stop')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog('plan')}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t('changePlan')}
            </Button>
          </div>
          <ErrorText error={planToggle.error} />
        </div>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          {t('dangerSection')}
        </p>
        <p className="text-xs text-ink-muted">{t('deleteHint')}</p>
        <Button variant="outline" className="border-red-300 text-red-700 dark:text-red-400" onClick={() => setDialog('delete')}>
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('delete')}
        </Button>
      </div>

      {dialog === 'plan' && <ChangePlanModal tenant={tenant} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'delete' && <DeleteTenantModal tenant={tenant} onClose={() => setDialog(null)} />}
    </Card>
  );
}

function ChangePlanModal({
  tenant,
  onClose,
  onDone,
}: {
  tenant: TenantDetailDto;
  onClose: () => void;
  onDone: (data: TenantDetailDto) => void;
}) {
  const t = useTranslations('platformAdmin.actions');
  const tc = useTranslations('common');
  const [planCode, setPlanCode] = useState<PlanCode>(tenant.subscription?.plan.code ?? 'FREE');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>(
    tenant.subscription?.billingCycle ?? 'MONTHLY',
  );
  const mutation = useMutation({
    mutationFn: () => api.post<TenantDetailDto>(`/tenants/${tenant.id}/plan/change`, { planCode, billingCycle }),
    onSuccess: (data) => {
      onDone(data);
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open title={`${t('changePlan')}: ${tenant.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-ink-muted">{t('changePlanHint')}</p>
        <Field label={t('plan')}>
          <Select value={planCode} onChange={(e) => setPlanCode(e.target.value as PlanCode)}>
            {PLANS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} — ${p.priceMonthly}/mo
              </option>
            ))}
          </Select>
        </Field>
        {planCode !== 'FREE' && (
          <Field label={t('cycle')}>
            <Select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as 'MONTHLY' | 'YEARLY')}>
              <option value="MONTHLY">{t('monthly')}</option>
              <option value="YEARLY">{t('yearly')}</option>
            </Select>
          </Field>
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

function DeleteTenantModal({ tenant, onClose }: { tenant: TenantDetailDto; onClose: () => void }) {
  const t = useTranslations('platformAdmin.actions');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.delete(`/tenants/${tenant.id}`, { confirm: confirmText, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-admin', 'tenants'] });
      router.replace(`/${locale}/platform-admin/tenants`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (step === 1) setStep(2);
    else mutation.mutate();
  }

  return (
    <Modal open title={`${t('delete')}: ${tenant.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs font-semibold text-ink-faint">{t('stepOf', { step })}</p>
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {t('deleteWarning')}
        </p>
        {step === 1 ? (
          <>
            <p className="text-xs text-ink-muted">{t('deleteAlternative')}</p>
            <Field label={t('typeSlug', { slug: tenant.slug })}>
              <Input autoFocus dir="ltr" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label={t('enterPassword')}>
            <Input
              autoFocus
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={step === 1 ? confirmText.trim() !== tenant.slug : !password}
            variant="danger"
          >
            {step === 1 ? t('next') : t('deleteForever')}
          </Button>
          {step === 2 && (
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              {t('back')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
