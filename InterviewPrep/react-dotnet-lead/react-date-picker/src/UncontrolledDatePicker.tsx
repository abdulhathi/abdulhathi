import { useId, useState, type ChangeEvent } from 'react';

type UncontrolledDatePickerProps = {
  label: string;
  /** Only the starting value: later changes to this prop are ignored (remount with a new key to reset). */
  defaultValue?: string;
  onDateChange?: (value: string) => void;
};

/** The variant closest to the interview answer: the picker keeps its own state and still notifies the parent. */
export function UncontrolledDatePicker({ label, defaultValue = '', onDateChange }: UncontrolledDatePickerProps) {
  const id = useId();
  const [date, setDate] = useState(defaultValue);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDate(event.target.value);
    onDateChange?.(event.target.value);
  }

  return (
    <div className="date-picker">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={date} onChange={handleChange} />
    </div>
  );
}
