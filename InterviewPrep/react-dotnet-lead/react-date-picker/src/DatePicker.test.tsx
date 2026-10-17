import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { DatePicker } from './DatePicker';
import { UncontrolledDatePicker } from './UncontrolledDatePicker';

describe('DatePicker', () => {
  it('shows the value it receives through props', () => {
    render(<DatePicker label="Start date" value="2026-10-14" onChange={() => {}} />);
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-10-14');
  });

  it('raises onChange with the picked date', () => {
    const onChange = vi.fn();
    render(<DatePicker label="Start date" value="2026-10-14" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-20' } });

    expect(onChange).toHaveBeenCalledWith('2026-10-20');
  });

  it('follows the prop when the parent changes it', () => {
    const { rerender } = render(<DatePicker label="Start date" value="2026-10-14" onChange={() => {}} />);
    rerender(<DatePicker label="Start date" value="2026-11-01" onChange={() => {}} />);
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-11-01');
  });

  it('passes min, max and disabled to the input', () => {
    render(<DatePicker label="Start date" value="" onChange={() => {}} min="2026-01-01" max="2026-12-31" disabled />);
    const input = screen.getByLabelText('Start date');
    expect(input).toHaveAttribute('min', '2026-01-01');
    expect(input).toHaveAttribute('max', '2026-12-31');
    expect(input).toBeDisabled();
  });
});

describe('App (parent and child together)', () => {
  it('updates the parent state when the user picks a date', () => {
    render(<App />);
    expect(screen.getByText('Selected date: 2026-10-14')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-31' } });

    expect(screen.getByText('Selected date: 2026-10-31')).toBeInTheDocument();
  });
});

describe('UncontrolledDatePicker', () => {
  it('keeps its own state and still notifies the parent', () => {
    const onDateChange = vi.fn();
    render(<UncontrolledDatePicker label="Due date" defaultValue="2026-10-14" onDateChange={onDateChange} />);

    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-15' } });

    expect(screen.getByLabelText('Due date')).toHaveValue('2026-10-15');
    expect(onDateChange).toHaveBeenCalledWith('2026-10-15');
  });
});
