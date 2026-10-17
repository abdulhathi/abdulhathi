import { useId, type ChangeEvent } from 'react';

export type DatePickerProps = {
  label: string;
  /** The selected date as "YYYY-MM-DD", or "" for none. The parent owns this value. */
  value: string;
  /** Raised to the parent every time the user picks a date. */
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
};

/**
 * A controlled date picker: the value comes in through props and every change goes back out through onChange.
 * It keeps no state of its own, so it can never drift out of sync with its parent.
 */
export function DatePicker({ label, value, onChange, min, max, disabled = false }: DatePickerProps) {
  const id = useId();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="date-picker">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} min={min} max={max} disabled={disabled} onChange={handleChange} />
    </div>
  );
}
