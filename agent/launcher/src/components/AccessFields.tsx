import { ask, open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { Icon } from './Icon';
import { isRisky, programNameProblem, programOptions } from '../lib';

export function FolderList({
  folders,
  onChange,
  invalid,
  confirmRemove,
  disabled,
}: {
  folders: string[];
  onChange: (next: string[]) => void;
  invalid?: string | null;
  confirmRemove?: boolean;
  disabled?: boolean;
}) {
  const add = async () => {
    const picked = await open({
      directory: true,
      multiple: true,
      title: 'Choose a folder the AI may use',
    });
    const list = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
    const next = [...folders];
    for (const path of list) if (!next.includes(path)) next.push(path);
    onChange(next);
  };

  const remove = async (path: string) => {
    if (confirmRemove) {
      const ok = await ask(`Stop sharing ${path} with AI apps?`, {
        title: 'Remove folder',
        kind: 'warning',
        okLabel: 'Remove',
        cancelLabel: 'Cancel',
      });
      if (!ok) return;
    }
    onChange(folders.filter((f) => f !== path));
  };

  return (
    <div className="list-container">
      {folders.length === 0 && <div className="empty-row">No folders yet.</div>}
      {folders.map((path) => (
        <div key={path} className={`list-row${invalid === path ? ' invalid' : ''}`}>
          <div className="row-left" title={path}>
            <Icon name="folder" className="row-icon" />
            <span className="row-path">{path}</span>
          </div>
          <button
            type="button"
            className="row-remove"
            title="Remove folder"
            aria-label={`Remove ${path}`}
            disabled={disabled}
            onClick={() => remove(path)}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      {invalid && folders.includes(invalid) && (
        <div className="row-error">This folder no longer exists.</div>
      )}
      <button type="button" className="btn btn-ghost btn-sm btn-start" disabled={disabled} onClick={add}>
        <Icon name="plus" size={13} />
        Add folder…
      </button>
    </div>
  );
}

export function ProgramChecklist({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const confirmRisky = async (name: string) => {
    if (!isRisky(name)) return true;
    return ask(`Allow ${name}? Approved ${name} commands can read or change any file on this computer.`, {
      title: 'Allow a program',
      kind: 'warning',
      okLabel: 'Allow',
      cancelLabel: 'Cancel',
    });
  };

  const toggle = async (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name));
      return;
    }
    if (!(await confirmRisky(name))) return;
    onChange([...selected, name]);
  };

  const add = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    const issue = programNameProblem(draft);
    if (issue) {
      setProblem(issue);
      return;
    }
    const name = draft.trim();
    if (selected.includes(name)) {
      setProblem(`${name} is already allowed.`);
      return;
    }
    if (!(await confirmRisky(name))) return;
    onChange([...selected, name]);
    setDraft('');
    setProblem(null);
  };

  return (
    <div className="program-list">
      {programOptions(selected).map((program) => {
        const checked = selected.includes(program.name);
        if (program.custom) {
          return (
            <div key={program.name} className="list-row">
              <span className="checkbox-label">
                <Icon name="terminal" size={14} className="row-icon" />
                <span className="code-prog">{program.name}</span>
                <span className="code-desc">{program.description}</span>
              </span>
              <span className="row-left row-end">
                {isRisky(program.name) && <span className="tag-danger">Can run any code</span>}
                <button
                  type="button"
                  className="row-remove"
                  title="Remove program"
                  aria-label={`Remove ${program.name}`}
                  disabled={disabled}
                  onClick={() => onChange(selected.filter((s) => s !== program.name))}
                >
                  <Icon name="x" size={14} />
                </button>
              </span>
            </div>
          );
        }
        return (
          <button
            type="button"
            key={program.name}
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            className={`checkbox-row${checked ? ' checked' : ''}`}
            onClick={() => toggle(program.name)}
          >
            <span className="checkbox-label">
              <span className="custom-check">{checked && <Icon name="check" size={11} />}</span>
              <span className="code-prog">{program.name}</span>
              <span className="code-desc">{program.description}</span>
            </span>
            {isRisky(program.name) && <span className="tag-danger">Can run any code</span>}
          </button>
        );
      })}
      <div className="add-program-row">
        <input
          className="input mono input-sm"
          aria-label="Program name"
          placeholder="Another program, like make"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={draft}
          disabled={disabled}
          aria-invalid={problem !== null}
          onChange={(e) => {
            setDraft(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add(e);
          }}
        />
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || !draft.trim()} onClick={() => add()}>
          <Icon name="plus" size={13} />
          Add
        </button>
      </div>
      {problem && <div className="row-error">{problem}</div>}
    </div>
  );
}

export function RiskNote() {
  return (
    <div className="alert alert-risk">
      <Icon name="alert" />
      <div>Programs marked “Can run any code” let an approved command read or change any file on this computer.</div>
    </div>
  );
}
