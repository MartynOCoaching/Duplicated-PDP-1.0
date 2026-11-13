import type { ReactNode } from 'react';
import { sanitizeUUID } from '../supabase';

interface SwitchableChild {
  id: string;
  name: string;
}

interface ChildSwitcherProps {
  children: SwitchableChild[];
  activeId: string | null | undefined;
  onSelect: (childId: string) => void;
  action?: ReactNode;
}

const isSameId = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    return sanitizeUUID(a) === sanitizeUUID(b);
  } catch (_) {
    return false;
  }
};

export default function ChildSwitcher({ children, activeId, onSelect, action }: ChildSwitcherProps) {
  const hasSwitch = children.length > 1;
  if (!hasSwitch && !action) return null;

  return (
    <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex flex-wrap items-center gap-3">
      {hasSwitch && (
        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">My Child:</span>
      )}
      {action && <div className="ml-auto sm:order-last">{action}</div>}
      {hasSwitch && (
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto order-1 sm:order-none">
          {children.map(child => {
            const active = isSameId(activeId, child.id);
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelect(child.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-sans transition-all flex items-center gap-2 ${
                  active
                    ? 'bg-[#00BBFF]/15 text-[#00BBFF] border border-[#00BBFF]/30'
                    : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#00BBFF]' : 'bg-slate-400'}`} />
                {child.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
