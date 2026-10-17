import { useState } from 'react';
import { DatePicker } from './DatePicker';

/** The parent: it owns the date, passes it down as a prop, and receives changes through the onChange event. */
export default function App() {
  const [startDate, setStartDate] = useState('2026-10-14');

  return (
    <main>
      <h1>Schedule</h1>
      <DatePicker label="Start date" value={startDate} onChange={setStartDate} min="2026-01-01" max="2026-12-31" />
      <p aria-live="polite">Selected date: {startDate || 'none'}</p>
    </main>
  );
}
