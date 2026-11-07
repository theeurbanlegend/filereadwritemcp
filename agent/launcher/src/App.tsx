import { getCurrentWindow } from '@tauri-apps/api/window';
import { ApprovalWindow } from './views/Approval';
import { MainWindow } from './views/MainWindow';

export function App() {
  return getCurrentWindow().label === 'approval' ? <ApprovalWindow /> : <MainWindow />;
}
