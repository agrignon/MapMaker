import { useState, useCallback, useEffect, useMemo } from 'react';
import { Drawer } from 'vaul';

const PEEK = '80px';
const SNAP_POINTS = [PEEK, 0.45, 1] as const;
const HANDLE_HEIGHT = 30; // handle (4px) + margins (10+6) + padding

export function BottomSheet({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<number | string | null>(PEEK);

  // Safety net: if vaul fires onOpenChange(false) due to double-tap on handle
  // (GitHub #362), prevent the sheet from disappearing by ignoring close.
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      // Re-snap to peek instead of closing — there is no Trigger to reopen
      setSnap(PEEK);
    }
  }, []);

  // Vaul bug: doesn't forward modal={false} to Radix Dialog.Root, so Radix
  // defaults to modal=true. This causes two blocking mechanisms:
  //
  // 1. DismissableLayer sets pointer-events:none on document.body, blocking
  //    all touch/click outside the drawer. Vaul's one-time rAF fix doesn't
  //    survive Radix re-applying it on re-renders (snap point changes).
  //
  // 2. FocusScope with trapped=true intercepts focusin events and redirects
  //    focus back into the drawer.
  useEffect(() => {
    // Fix #1: Remove pointer-events:none whenever Radix re-applies it
    const observer = new MutationObserver(() => {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    if (document.body.style.pointerEvents === 'none') {
      document.body.style.pointerEvents = '';
    }

    // Fix #2: FocusScope traps via both focusin (redirect outside→inside) and
    // focusout (intercept leaving). Both are bubble-phase document listeners.
    // Capture-phase handlers run first and block them.
    const defeatFocusIn = (e: FocusEvent) => {
      const drawer = document.querySelector('[data-vaul-drawer]');
      if (drawer && !drawer.contains(e.target as HTMLElement)) {
        e.stopImmediatePropagation();
      }
    };
    const defeatFocusOut = (e: FocusEvent) => {
      const drawer = document.querySelector('[data-vaul-drawer]');
      if (drawer && drawer.contains(e.target as HTMLElement)) {
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('focusin', defeatFocusIn, true);
    document.addEventListener('focusout', defeatFocusOut, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', defeatFocusIn, true);
      document.removeEventListener('focusout', defeatFocusOut, true);
    };
  }, []);

  return (
    <Drawer.Root
      open={true}
      modal={false}
      dismissible={false}
      snapPoints={SNAP_POINTS as unknown as (number | string)[]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      fadeFromIndex={2}
      onOpenChange={handleOpenChange}
    >
      <Drawer.Portal>
        <Drawer.Content
          data-testid="bottom-sheet-content"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '100%',
            maxHeight: '97dvh',
            zIndex: 10,
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '14px 14px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            paddingBottom: 'max(8px, var(--safe-bottom))',
            paddingLeft: 'var(--safe-left)',
            paddingRight: 'var(--safe-right)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Drawer.Handle
            data-testid="bottom-sheet-handle"
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.3)',
              margin: '10px auto 6px',
            }}
          />
          <div
            style={{
              overflowY: 'auto',
              padding: '0 14px 6px',
              maxHeight: typeof snap === 'string'
                ? `calc(${snap} - ${HANDLE_HEIGHT}px)`
                : typeof snap === 'number'
                  ? `calc(${Math.min(snap * 100, 97)}dvh - ${HANDLE_HEIGHT}px)`
                  : undefined,
            }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
