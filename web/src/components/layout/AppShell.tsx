import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { ShellTop } from './ShellTop';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-body">
        <ShellTop />
        <main className="shell-main"><Outlet /></main>
        <Footer />
      </div>
    </div>
  );
}
