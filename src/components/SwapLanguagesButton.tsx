interface SwapLanguagesButtonProps {
  disabled: boolean;
  onSwap: () => void;
}

export function SwapLanguagesButton({ disabled, onSwap }: SwapLanguagesButtonProps) {
  return (
    <button
      type="button"
      onClick={onSwap}
      disabled={disabled}
      className="swap-button"
      aria-label={disabled ? "This language pair cannot be reversed" : "Swap source and target languages"}
      title={disabled ? "This direction cannot be reversed" : "Swap languages"}
    >
      <span aria-hidden="true">⇄</span>
    </button>
  );
}
