import { redirect } from 'next/navigation';
import { signupTabPath } from '@/lib/organizer-paths';

type PageParams = { params: Promise<{ id: string }> };

export default async function EditSignupRedirect({ params }: PageParams) {
  const { id } = await params;
  redirect(signupTabPath(id, 'settings'));
}
