import { Crumb } from '@/components/chrome/Crumb';
import { crumbTranslator } from '@/components/chrome/crumb-text';

export default async function SettingsCrumb() {
  const t = await crumbTranslator();
  if (!t) return null;
  return <Crumb>{t('settings')}</Crumb>;
}
