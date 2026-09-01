import { Redirect } from 'expo-router';

import { useStore } from '@/store/useStore';

export default function Index() {
  const actorId = useStore((s) => s.actorId);
  return <Redirect href={actorId ? '/(tabs)/home' : '/sign-in'} />;
}
