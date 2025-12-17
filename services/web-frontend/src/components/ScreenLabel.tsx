type Props = {
  label: string;
};

export function ScreenLabel({ label }: Props) {
  if (!import.meta.env.DEV || !label) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(label);
        return;
      }
    } catch {
      // fallback to execCommand
    }

    const textarea = document.createElement('textarea');
    textarea.value = label;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  return (
    <button
      type="button"
      className="screen-label"
      onClick={handleCopy}
      title="Click to copy screen name"
    >
      {label}
    </button>
  );
}
