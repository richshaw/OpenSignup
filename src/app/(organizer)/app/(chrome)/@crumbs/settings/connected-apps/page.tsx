import { Crumb } from '@/components/chrome/Crumb';
import { crumbTranslator } from '@/components/chrome/crumb-text';

export default async function ConnectedAppsCrumb() {
  const t = await crumbTranslator();
  if (!t) return null;
  return (
    <>
      <Crumb href="/app/settings">{t('settings')}</Crumb>
      <Crumb>{t('connectedApps')}</Crumb>
    </>
  );
}
