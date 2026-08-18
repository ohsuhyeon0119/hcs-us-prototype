import Study from '@/components/Study';
import { listScenarios } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function StudyPage() {
  return <Study scenarios={await listScenarios()} />;
}
