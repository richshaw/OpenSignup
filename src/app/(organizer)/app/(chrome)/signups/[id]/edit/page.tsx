import { redirect } from 'next/navigation';

type PageParams = { params: Promise<{ id: string }> };

export default async function EditSignupRedirect({ params }: PageParams) {
  const { id } = await params;
  redirect(`/app/signups/${id}/settings`);
}
