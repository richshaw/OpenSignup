import { getOrganizerSession, toActor } from '@/auth/session';
import { Crumb } from '@/components/chrome/Crumb';
import { loadSignupForOrganizer } from '@/services/signups.cached';

type CrumbParams = { params: Promise<{ id: string }> };

export default async function BuildCrumb({ params }: CrumbParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return null;
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  return <Crumb truncate>{result.value.title}</Crumb>;
}
