type Props = {
  label: string;
};

export function ScreenLabel({ label }: Props) {
  if (!import.meta.env.DEV || !label) return null;

  return (
    <div className="screen-label" aria-hidden="true">
      {label}
    </div>
  );
}
