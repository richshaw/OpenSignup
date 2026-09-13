import { Crumb } from '@/components/chrome/Crumb';

export default function ConnectedAppsCrumb() {
  return (
    <>
      <Crumb href="/app/settings">Settings</Crumb>
      <Crumb>Connected apps</Crumb>
    </>
  );
}
