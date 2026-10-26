import { INSTALL_UNIX, INSTALL_WINDOWS } from '../../lib/install';
import { CommandBlock } from '../ui/CommandBlock';

export function InstallCommands() {
  return (
    <div className="cmd-grid">
      <CommandBlock label="macOS / Linux" command={INSTALL_UNIX} />
      <CommandBlock label="Windows (PowerShell)" command={INSTALL_WINDOWS} />
    </div>
  );
}
