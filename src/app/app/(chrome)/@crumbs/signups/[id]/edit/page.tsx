import { getOrganizerSession, toActor } from '@/auth/session';
import { Crumb } from '@/components/chrome/Crumb';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { loadSignupForOrganizer } from '@/services/signups.cached';

type CrumbParams = { params: Promise<{ id: string }> };

export default async function EditSignupCrumb({ params }: CrumbParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return null;
  const t = getServerTranslator(getOrganizerAppLocale(session), 'organizer.crumbs');
  const result = await loadSignupForOrganizer(toActor(session), id);
  return (
    <>
      {result.ok ? (
        <Crumb href={`/app/signups/${id}`} truncate>
          {result.value.title}
        </Crumb>
      ) : null}
      <Crumb>{t('edit')}</Crumb>
    </>
  );
}
