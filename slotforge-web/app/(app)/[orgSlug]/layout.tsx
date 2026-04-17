import { Sidebar } from '@/components/app/sidebar'

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#07080d' }}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ minWidth: 0 }}
      >
        {children}
      </main>
    </div>
  )
}
