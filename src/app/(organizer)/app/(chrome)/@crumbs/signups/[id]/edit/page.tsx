import { getOrganizerSession, toActor } from '@/auth/session';
import { Crumb } from '@/components/chrome/Crumb';
import { loadSignupForOrganizer } from '@/services/signups.cached';

type CrumbParams = { params: Promise<{ id: string }> };

export default async function EditSignupCrumb({ params }: CrumbParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return null;
  const result = await loadSignupForOrganizer(toActor(session), id);
  return (
    <>
      {result.ok ? (
        <Crumb href={`/app/signups/${id}`} truncate>
          {result.value.title}
        </Crumb>
      ) : null}
      <Crumb>Edit</Crumb>
    </>
  );
}
