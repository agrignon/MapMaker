import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MobileViewToggle } from '../MobileViewToggle';

// Save the default matchMedia mock from setup.ts so we can restore it after spy tests
const defaultMatchMedia = window.matchMedia;

describe('MobileViewToggle', () => {
  // Default matchMedia mock returns matches: false → getTier() = 'mobile'

  afterEach(() => {
    // Restore the default mock after any test that may have overridden matchMedia
    window.matchMedia = defaultMatchMedia;
  });

  it('renders toggle button on mobile', () => {
    render(<MobileViewToggle activeView="map" onToggle={() => {}} />);
    expect(screen.getByTestId('mobile-view-toggle')).toBeInTheDocument();
  });

  it('shows "3D Preview" text when activeView is map', () => {
    render(<MobileViewToggle activeView="map" onToggle={() => {}} />);
    expect(screen.getByTestId('mobile-view-toggle')).toHaveTextContent('3D Preview');
  });

  it('shows "Map" text when activeView is preview', () => {
    render(<MobileViewToggle activeView="preview" onToggle={() => {}} />);
    expect(screen.getByTestId('mobile-view-toggle')).toHaveTextContent('Map');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<MobileViewToggle activeView="map" onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('mobile-view-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label when on map view', () => {
    render(<MobileViewToggle activeView="map" onToggle={() => {}} />);
    expect(screen.getByTestId('mobile-view-toggle')).toHaveAttribute(
      'aria-label',
      'Show 3D preview'
    );
  });

  it('has correct aria-label when on preview view', () => {
    render(<MobileViewToggle activeView="preview" onToggle={() => {}} />);
    expect(screen.getByTestId('mobile-view-toggle')).toHaveAttribute(
      'aria-label',
      'Show map'
    );
  });

  it('has at least 44px touch target', () => {
    render(<MobileViewToggle activeView="map" onToggle={() => {}} />);
    const button = screen.getByTestId('mobile-view-toggle');
    expect(button.style.minHeight).toBe('44px');
    expect(button.style.minWidth).toBe('44px');
  });

  it('returns null on desktop tier', () => {
    // Override matchMedia to return desktop
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 1024px)' || query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(<MobileViewToggle activeView="map" onToggle={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null on tablet tier', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = render(<MobileViewToggle activeView="map" onToggle={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
