import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { TopBar } from './TopBar';

export function PublicLayout() {
  return (
    <>
      <TopBar />
      <main className="main"><Outlet /></main>
      <Footer />
    </>
  );
}
