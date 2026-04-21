import { useState, useCallback } from 'react';
import { useColorSchemeStore, ColorScheme, applyScheme } from '@/store/colorSchemeStore';
import { ChevronDown, ChevronUp, Plus, Copy, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const PRIORITY_LABELS = ['FLEX', 'SEMI', 'FIXED', 'LOCK'] as const;

function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return '#888888';
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function ColorSwatch({ hsl, size = 16 }: { hsl: string; size?: number }) {
  return (
    <div
      className="rounded-[2px] border border-foreground/10"
      style={{ width: size, height: size, backgroundColor: `hsl(${hsl})` }}
    />
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 min-w-0">
      <span className="text-[8px] font-mono text-muted-foreground/50 tracking-widest w-10 shrink-0">{label}</span>
      <div className="relative">
        <input
          type="color"
          value={hslToHex(value)}
          onChange={(e) => onChange(hexToHsl(e.target.value))}
          className="w-6 h-6 rounded-[2px] border border-border/50 cursor-pointer bg-transparent p-0"
          style={{ appearance: 'none', WebkitAppearance: 'none' }}
        />
      </div>
      <span className="text-[8px] font-mono text-muted-foreground/30 truncate">{value}</span>
    </label>
  );
}

export function ColorSchemePanel() {
  const activeLightSchemeId = useColorSchemeStore(s => s.activeLightSchemeId);
  const activeDarkSchemeId = useColorSchemeStore(s => s.activeDarkSchemeId);
  const isDark = useColorSchemeStore(s => s.isDark);
  const customSchemes = useColorSchemeStore(s => s.customSchemes);
  const setActiveScheme = useColorSchemeStore(s => s.setActiveScheme);
  const addCustomScheme = useColorSchemeStore(s => s.addCustomScheme);
  const updateCustomScheme = useColorSchemeStore(s => s.updateCustomScheme);
  const deleteCustomScheme = useColorSchemeStore(s => s.deleteCustomScheme);
  const duplicateScheme = useColorSchemeStore(s => s.duplicateScheme);
  const allSchemes = useColorSchemeStore(s => s.allSchemes);

  const activeSchemeId = isDark ? activeDarkSchemeId : activeLightSchemeId;
  const schemes = allSchemes();
  const active = schemes.find(s => s.id === activeSchemeId) || schemes[0];

  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const isCustom = !active.preset;

  const handlePriorityChange = useCallback((priority: 0 | 1 | 2 | 3, field: 'stroke' | 'fill', value: string) => {
    if (!isCustom) return;
    const newPriorities = { ...active.priorities, [priority]: { ...active.priorities[priority], [field]: value } };
    updateCustomScheme(active.id, { priorities: newPriorities });
  }, [active, isCustom, updateCustomScheme]);

  const handleCreateNew = useCallback(() => {
    addCustomScheme({
      name: 'CUSTOM',
      priorities: { ...active.priorities },
      accent: active.accent,
      lockedFill: active.lockedFill,
      lockedText: active.lockedText,
    });
    setExpanded(true);
    toast.success('Custom scheme created');
  }, [active, addCustomScheme]);

  return (
    <div className="space-y-3">
      {/* Scheme selector — cassette-style strip */}
      <div className="bg-muted/20 border border-border/40 rounded-[2px] overflow-hidden">
        {/* Preset strip */}
        <div className="flex overflow-x-auto gap-0 scrollbar-none">
          {schemes.map((scheme) => (
            <button
              key={scheme.id}
              onClick={() => setActiveScheme(scheme.id)}
              className={`shrink-0 flex flex-col items-center gap-1.5 px-3 py-2.5 transition-colors border-b-2 ${
                scheme.id === activeSchemeId
                  ? 'border-foreground/40 bg-muted/40'
                  : 'border-transparent hover:bg-muted/20'
              }`}
            >
              {/* Mini priority swatch row */}
              <div className="flex gap-[2px]">
              {([0, 1, 2, 3] as const).map(p => (
                  <div
                    key={p}
                    className="w-[6px] h-[6px] rounded-[1px]"
                  style={{ backgroundColor: `hsl(${scheme.priorities[p].fill})` }}
                  />
                ))}
              </div>
              <span className="text-[7px] font-mono tracking-[0.15em] text-muted-foreground/60 whitespace-nowrap">
                {scheme.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Active scheme detail */}
      <div className="bg-muted/20 border border-border/40 rounded-[2px]">
        {/* Header row */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="flex gap-[3px]">
              {([0, 1, 2, 3] as const).map(p => (
                <ColorSwatch key={p} hsl={active.priorities[p].fill} size={12} />
              ))}
            </div>
            <span className="text-[10px] font-mono tracking-[0.1em] text-foreground/70">{active.name}</span>
            {isCustom && (
              <span className="text-[7px] font-mono text-primary/50 tracking-widest">CUSTOM</span>
            )}
          </div>
          {expanded ? <ChevronUp size={12} className="text-muted-foreground/40" /> : <ChevronDown size={12} className="text-muted-foreground/40" />}
        </button>

        {expanded && (
          <div className="border-t border-border/30 px-3 py-3 space-y-3">
            {/* Scheme name (editable for custom) */}
            {isCustom && (
              <div className="flex items-center gap-2">
                {editingName ? (
                  <input
                    autoFocus
                    defaultValue={active.name}
                    onBlur={(e) => {
                      updateCustomScheme(active.id, { name: e.target.value.toUpperCase() || 'CUSTOM' });
                      setEditingName(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="flex-1 bg-transparent border-b border-border/50 text-[10px] font-mono tracking-[0.1em] text-foreground/70 focus:outline-none focus:border-primary/40 py-1"
                  />
                ) : (
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-[10px] font-mono tracking-[0.1em] text-foreground/70 hover:text-foreground transition-colors"
                  >
                    {active.name}
                  </button>
                )}
              </div>
            )}

            {/* SYS. HEADER */}
            <div className="flex items-center gap-2 mb-1">
              <div className="h-px flex-1 bg-border/30" />
              <span className="text-[7px] font-mono text-muted-foreground/30 tracking-[0.2em]">ESCALATION MATRIX</span>
              <div className="h-px flex-1 bg-border/30" />
            </div>

            {/* Priority rows P0–P3 — direct stroke + fill editing */}
            {([0, 1, 2, 3] as const).map(p => (
              <div key={p} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-mono tracking-[0.12em] w-8 shrink-0" style={{ color: `hsl(${active.priorities[p].stroke})` }}>
                    P{p}
                  </span>
                  <span className="text-[8px] font-mono text-muted-foreground/40 tracking-widest flex-1">{PRIORITY_LABELS[p]}</span>
                  <ColorSwatch hsl={active.priorities[p].stroke} size={10} />
                  <ColorSwatch hsl={active.priorities[p].fill} size={10} />
                </div>
                {isCustom && (
                  <div className="flex gap-4 pl-10">
                    <ColorInput label="STROKE" value={active.priorities[p].stroke} onChange={(v) => handlePriorityChange(p, 'stroke', v)} />
                    <ColorInput label="FILL" value={active.priorities[p].fill} onChange={(v) => handlePriorityChange(p, 'fill', v)} />
                  </div>
                )}
              </div>
            ))}

            {/* Preview bar */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-border/30" />
                <span className="text-[7px] font-mono text-muted-foreground/30 tracking-[0.2em]">PREVIEW</span>
                <div className="h-px flex-1 bg-border/30" />
              </div>
              <div className="flex gap-1">
                {/* FLEX (P0) — faint tint + subtle P0 stroke */}
                <div
                  className="flex-1 h-6 rounded-[2px] flex items-center justify-center"
                  style={{
                    backgroundColor: `hsl(${active.priorities[0].fill} / 0.06)`,
                    border: `1px solid hsl(${active.priorities[0].stroke} / 0.5)`,
                  }}
                >
                  <span className="text-[7px] font-mono font-medium text-foreground/75">FLEX</span>
                </div>
                {/* SEMI (P1) — soft tint + P1 stroke */}
                <div
                  className="flex-1 h-6 rounded-[2px] flex items-center justify-center"
                  style={{
                    backgroundColor: `hsl(${active.priorities[1].fill} / 0.12)`,
                    border: `1.5px solid hsl(${active.priorities[1].stroke} / 0.7)`,
                  }}
                >
                  <span className="text-[7px] font-mono font-medium text-foreground/75">SEMI</span>
                </div>
                {/* FIXED (P2) — filled with P2 fill */}
                <div
                  className="flex-1 h-6 rounded-[2px] flex items-center justify-center"
                  style={{
                    backgroundColor: `hsl(${active.priorities[2].fill})`,
                    border: `1.5px solid hsl(${active.priorities[2].stroke})`,
                  }}
                >
                  <span className="text-[7px] font-mono font-medium" style={{ color: 'hsl(0 0% 100%)' }}>FIXED</span>
                </div>
                {/* LOCK (P3) — filled with P3 fill */}
                <div
                  className="flex-1 h-6 rounded-[2px] flex items-center justify-center"
                  style={{
                    backgroundColor: `hsl(${active.priorities[3].fill})`,
                    border: `1.5px solid hsl(${active.priorities[3].stroke})`,
                  }}
                >
                  <span className="text-[7px] font-mono font-medium" style={{ color: `hsl(${active.lockedText})` }}>LOCK</span>
                </div>
              </div>
            </div>

            {/* Site highlight color */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-px flex-1 bg-border/30" />
                <span className="text-[7px] font-mono text-muted-foreground/30 tracking-[0.2em]">SITE HIGHLIGHT</span>
                <div className="h-px flex-1 bg-border/30" />
              </div>
              <div className="flex items-center gap-3">
                <ColorSwatch hsl={active.accent} size={14} />
                <span className="text-[8px] font-mono text-muted-foreground/40 flex-1">NOW LINE · DATES · ROUTINES · OVERDUE</span>
              </div>
              {isCustom && (
                <div className="mt-1.5">
                  <ColorInput label="COLOR" value={active.accent} onChange={(v) => updateCustomScheme(active.id, { accent: v })} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-1.5 pt-2 border-t border-border/20">
              <button
                onClick={() => { duplicateScheme(active.id); toast.success('Scheme duplicated'); }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-[2px] text-[8px] font-mono tracking-widest text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors border border-border/30"
              >
                <Copy size={9} />
                CLONE
              </button>
              {!isCustom && (
                <button
                  onClick={handleCreateNew}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-[2px] text-[8px] font-mono tracking-widest text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors border border-border/30"
                >
                  <Plus size={9} />
                  NEW
                </button>
              )}
              {isCustom && (
                <>
                  <button
                    onClick={() => {
                      const fallback = isDark ? 'dark-industrial' : 'industrial';
                      setActiveScheme(fallback);
                      deleteCustomScheme(active.id);
                      toast.success('Scheme deleted');
                    }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-[2px] text-[8px] font-mono tracking-widest text-destructive/50 hover:text-destructive hover:bg-destructive/5 transition-colors border border-destructive/20"
                  >
                    <Trash2 size={9} />
                    DELETE
                  </button>
                  <button
                    onClick={() => {
                      const fallback = isDark ? 'dark-industrial' : 'industrial';
                      setActiveScheme(fallback);
                      toast.success('Reset to default');
                    }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-[2px] text-[8px] font-mono tracking-widest text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors border border-border/30"
                  >
                    <RotateCcw size={9} />
                    DEFAULT
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
