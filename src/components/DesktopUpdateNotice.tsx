import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { prepareDesktopRestart, type DesktopUpdateState } from '@/lib/desktopUpdates';

export function DesktopUpdateNotice() {
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  useEffect(() => window.spacetimeUpdates?.subscribe(next => { setState(next); setError(''); }), []);
  const bridge = window.spacetimeUpdates;
  if (!bridge || !state?.visible || state.phase === 'idle') return null;
  const ready = state.phase === 'downloaded' || (state.phase === 'error' && state.retry === 'restart');
  const downloading = state.phase === 'downloading';
  const checking = state.phase === 'checking';
  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try { await action(); } catch { setError('Could not connect to the updater. Please try again.'); }
    finally { busy.current = false; }
  };
  const restart = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError('');
    try {
      if (!await prepareDesktopRestart()) {
        setError('Could not finish syncing. Open your schedule, check your connection, and try again. Your update is ready whenever you are.');
        return;
      }
      if (!await bridge.restart()) setError('Could not restart for this update. Please try again.');
    } catch { setError('Could not restart for this update. Please try again.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const title = ready ? 'Ready to update' : downloading ? 'Downloading update' : checking ? 'Checking for updates' :
    state.phase === 'current' ? 'You’re up to date' : state.phase === 'error' ? 'Update interrupted' : 'Update available';
  const action = state.phase === 'error' && state.retry === 'check' ? bridge.check : bridge.download;
  return <>
    <aside aria-label="Spacetime update" onKeyDown={event => event.stopPropagation()} className="fixed bottom-5 right-5 z-40 w-[calc(100%-2.5rem)] max-w-sm">
      <Alert role="status" className="shadow-lg">
        {ready ? <RefreshCw aria-hidden="true" className="size-4" /> : <Download aria-hidden="true" className="size-4" />}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{ready ? 'Restart Spacetime when you’re ready. Your account and saved data stay in place.' :
            downloading ? `${state.percent ?? 0}% downloaded. Keep using Spacetime while it finishes.` :
            checking ? 'Looking for the latest version of Spacetime.' : state.phase === 'current' ? 'You have the latest version of Spacetime.' :
            state.phase === 'error' ? 'Your app stays open. Try again when your connection is ready.' :
            `Spacetime ${state.version ?? ''} is ready to download.`}</p>
          {downloading ? <Progress aria-label="Update download progress" value={state.percent ?? 0} className="mt-3" /> : null}
          {error && !confirmRestart ? <p role="alert" className="mt-3">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {ready ? <Button size="sm" onClick={() => { setError(''); setConfirmRestart(true); }}>Restart to update</Button> :
              !checking && !downloading && state.phase !== 'current' ? <Button size="sm" onClick={() => void run(action)}>{state.phase === 'error' ? 'Try again' : 'Download'}</Button> : null}
            <Button size="sm" variant="outline" onClick={() => void run(bridge.dismiss)}>{state.phase === 'current' ? 'Close' : 'Later'}</Button>
          </div>
        </AlertDescription>
      </Alert>
    </aside>
    <AlertDialog open={confirmRestart} onOpenChange={open => { if (!busy.current) setConfirmRestart(open); }}>
      <AlertDialogContent onKeyDown={event => event.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{saving ? 'Saving before restart' : 'Restart Spacetime?'}</AlertDialogTitle>
          <AlertDialogDescription>Finish any open edits first. Spacetime will sync your saved changes before restarting to install the update.</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm">{error}</p> : null}
        <AlertDialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => { setConfirmRestart(false); setError(''); }}>Later</Button>
          <Button disabled={saving} onClick={() => void restart()}>{saving ? 'Syncing…' : error ? 'Try again' : 'Save and restart'}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
