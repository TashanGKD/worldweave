import DashboardClient from '@/app/dashboard-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return <DashboardClient initialScene="global" initialState={null} initialSubworlds={[]} />;
}
