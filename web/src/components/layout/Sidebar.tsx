import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Brand } from './Brand';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="side-nav" aria-label="App">
        <NavLink to="/dashboard" aria-label="Dashboard">
          <Icon name="grid" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/settings" aria-label="Settings">
          <Icon name="settings" />
          <span>Settings</span>
        </NavLink>
      </nav>
    </aside>
  );
}
