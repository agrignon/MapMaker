import { CollapsibleSection } from './CollapsibleSection';

interface LayerPlaceholderSectionProps {
  label: string;
  description?: string;
}

export function LayerPlaceholderSection({ label, description: _description }: LayerPlaceholderSectionProps) {
  return (
    <CollapsibleSection
      label={label}
      summary="Coming soon"
      toggle={{
        checked: true,
        onChange: () => {},
        disabled: true,
      }}
      defaultOpen={false}
    >
      <div style={{ paddingTop: '4px' }}>
        <p
          style={{
            color: '#6b7280',
            fontSize: '12px',
            fontStyle: 'italic',
            margin: 0,
          }}
        >
          Coming in a future update
        </p>
      </div>
    </CollapsibleSection>
  );
}
