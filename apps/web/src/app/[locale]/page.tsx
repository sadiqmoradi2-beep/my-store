import { redirect } from 'next/navigation';

export default async function LocaleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
