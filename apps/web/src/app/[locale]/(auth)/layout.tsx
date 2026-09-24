import { useTranslations } from 'next-intl';
import { Store } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_4fr]">
      <BrandPanel />
      <main className="flex items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

function BrandPanel() {
  const t = useTranslations('auth');
  return (
    <aside className="relative hidden overflow-hidden bg-primary-900 lg:block">
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(circle, #e8efe9 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div className="absolute -start-32 -top-32 h-96 w-96 rounded-full bg-primary-700/60 blur-3xl" />
      <div className="absolute -bottom-40 -end-24 h-[28rem] w-[28rem] rounded-full bg-accent-500/25 blur-3xl" />
      <div className="relative flex h-full flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500 text-primary-900 shadow-lg">
            <Store className="h-6 w-6" />
          </span>
          <span className="text-2xl font-black tracking-tight text-white">MY STORE</span>
        </div>
        <div>
          <p className="max-w-md text-4xl font-black leading-snug text-white">
            Your shop,
            <br />
            <span className="text-accent-300">at your fingertips.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-primary-100/80">
            {t('loginSubtitle')} — Multiple branches, multiple warehouses; all in one panel.
          </p>
        </div>
        <div className="flex items-center justify-between text-xs text-primary-200/60">
          <span>MY STORE · Enterprise Sales Platform</span>
          <a href="mailto:sadiqmoradi2@gmail.com" className="cursor-pointer hover:text-primary-100">
            Contact Us
          </a>
        </div>
      </div>
    </aside>
  );
}
