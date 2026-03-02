import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture props passed to Drawer.Root
let capturedRootProps: Record<string, unknown> = {};

vi.mock('vaul', () => {
  const Drawer = {
    Root: (props: Record<string, unknown>) => {
      capturedRootProps = props;
      return React.createElement('div', { 'data-testid': 'drawer-root' }, props.children as React.ReactNode);
    },
    Portal: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    Content: (props: Record<string, unknown>) => {
      const { children, ...rest } = props;
      return React.createElement('div', { 'data-testid': 'bottom-sheet-content', ...rest }, children as React.ReactNode);
    },
    Handle: (props: Record<string, unknown>) => {
      const { children: _children, ...rest } = props;
      return React.createElement('div', { 'data-testid': 'bottom-sheet-handle', ...rest });
    },
    Overlay: () => null,
  };
  return { Drawer };
});

import { BottomSheet } from '../BottomSheet';

describe('BottomSheet', () => {
  beforeEach(() => {
    capturedRootProps = {};
  });

  it('renders children inside the sheet', () => {
    render(
      <BottomSheet>
        <span>Test Content</span>
      </BottomSheet>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('configures snap points with peek, half, and full values (SHEET-01)', () => {
    render(<BottomSheet><div /></BottomSheet>);
    const snapPoints = capturedRootProps.snapPoints as (number | string)[];
    expect(snapPoints).toHaveLength(3);
    expect(snapPoints[0]).toBe('80px');       // peek: 80px (string for vaul pixel snap)
    expect(snapPoints[1]).toBeCloseTo(0.45); // half: ~45vh
    expect(snapPoints[2]).toBe(1);           // full: full height
  });

  it('renders Drawer.Handle for drag pill (SHEET-02)', () => {
    render(<BottomSheet><div /></BottomSheet>);
    expect(screen.getByTestId('bottom-sheet-handle')).toBeInTheDocument();
  });

  it('sets modal=false so map stays interactive (SHEET-03)', () => {
    render(<BottomSheet><div /></BottomSheet>);
    expect(capturedRootProps.modal).toBe(false);
  });

  it('does not set snapToSequentialPoint, enabling velocity flick (SHEET-05)', () => {
    render(<BottomSheet><div /></BottomSheet>);
    expect(capturedRootProps.snapToSequentialPoint).toBeUndefined();
  });

  it('sets open=true and dismissible=false for always-visible sheet', () => {
    render(<BottomSheet><div /></BottomSheet>);
    expect(capturedRootProps.open).toBe(true);
    expect(capturedRootProps.dismissible).toBe(false);
  });

  it('starts at peek snap point', () => {
    render(<BottomSheet><div /></BottomSheet>);
    expect(capturedRootProps.activeSnapPoint).toBe('80px');
  });

  it('provides onOpenChange handler to prevent sheet from closing', () => {
    render(<BottomSheet><div /></BottomSheet>);
    expect(typeof capturedRootProps.onOpenChange).toBe('function');
  });
});
