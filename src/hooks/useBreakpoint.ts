import { useState, useEffect } from 'react';

export type DeviceTier = 'mobile' | 'tablet' | 'desktop';

export function getTier(): DeviceTier {
  if (window.matchMedia('(min-width: 1024px)').matches) return 'desktop';
  if (window.matchMedia('(min-width: 768px)').matches) return 'tablet';
  return 'mobile';
}

export function useBreakpoint(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>(getTier);

  useEffect(() => {
    const mq768 = window.matchMedia('(min-width: 768px)');
    const mq1024 = window.matchMedia('(min-width: 1024px)');

    const handleChange = () => setTier(getTier());

    mq768.addEventListener('change', handleChange);
    mq1024.addEventListener('change', handleChange);

    return () => {
      mq768.removeEventListener('change', handleChange);
      mq1024.removeEventListener('change', handleChange);
    };
  }, []);

  return tier;
}
