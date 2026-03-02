import { useState, useCallback } from 'react';
import { Drawer } from 'vaul';

const PEEK = '80px';
const SNAP_POINTS = [PEEK, 0.45, 1] as const;

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
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '0 14px 6px',
            }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
