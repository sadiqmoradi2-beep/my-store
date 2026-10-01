'use client';

import { useMutation } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { AuthUser, TwoFactorSetup } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Badge, Button, Card, ErrorText, Field, Input } from '@/components/ui';

export function TwoFactorCard() {
  const t = useTranslations('twoFactor');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');

  useEffect(() => {
    if (!setup) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 220 }).then(setQrDataUrl);
  }, [setup]);

  const start = useMutation({
    mutationFn: () => api.post<TwoFactorSetup>('/auth/2fa/setup'),
    onSuccess: setSetup,
  });
  const enable = useMutation({
    mutationFn: () => api.post<AuthUser>('/auth/2fa/enable', { code }),
    onSuccess: (next) => {
      setUser(next);
      setSetup(null);
      setCode('');
    },
  });
  const disable = useMutation({
    mutationFn: () => api.post<AuthUser>('/auth/2fa/disable', { code, password: disablePassword }),
    onSuccess: (next) => {
      setUser(next);
      setCode('');
      setDisablePassword('');
    },
  });

  const enabled = user?.twoFactorEnabled ?? false;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="h-5 w-5 text-primary-600" aria-hidden />
          ) : (
            <ShieldOff className="h-5 w-5 text-ink-faint" aria-hidden />
          )}
          <p className="text-sm font-semibold text-ink">{t('title')}</p>
        </div>
        <Badge tone={enabled ? 'DELIVERED' : 'neutral'}>
          {enabled ? t('enabled') : t('disabled')}
        </Badge>
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">{t('hint')}</p>

      <ErrorText error={start.error} />
      <ErrorText error={enable.error} />
      <ErrorText error={disable.error} />

      {!enabled && !setup && (
        <Button variant="outline" className="mt-4" loading={start.isPending} onClick={() => start.mutate()}>
          {t('start')}
        </Button>
      )}

      {!enabled && setup && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink-muted">{t('scanQr')}</p>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR" className="rounded-lg border border-line bg-white p-2" />
          )}
          <p className="text-xs text-ink-faint">
            {t('manualSecret')}:{' '}
            <code dir="ltr" className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px]">
              {setup.secret}
            </code>
          </p>
          <Field label={t('enterCode')}>
            <Input
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-40"
              placeholder="123456"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              loading={enable.isPending}
              disabled={code.length !== 6}
              onClick={() => enable.mutate()}
            >
              {t('confirmEnable')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSetup(null);
                setCode('');
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="mt-4 space-y-3">
          <Field label={t('currentPassword')}>
            <Input
              type="password"
              dir="ltr"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="w-60"
            />
          </Field>
          <Field label={t('enterCodeToDisable')}>
            <Input
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-40"
              placeholder="123456"
            />
          </Field>
          <Button
            variant="danger"
            loading={disable.isPending}
            disabled={code.length !== 6 || !disablePassword}
            onClick={() => disable.mutate()}
          >
            {t('disable')}
          </Button>
        </div>
      )}
    </Card>
  );
}
