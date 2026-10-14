import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Diagram } from '../diagrams/Diagram';
import { hello } from '../diagrams/specs';

describe('Diagram zoom viewer', () => {
  it('opens from the Zoom button, zooms with buttons and keys, and closes', async () => {
    const user = userEvent.setup();
    render(<Diagram spec={hello} caption="Hello flow" />);

    await user.click(screen.getByRole('button', { name: 'Zoom diagram' }));
    const dialog = screen.getByRole('dialog', { name: 'Diagram viewer' });
    expect(within(dialog).getByText('Hello flow')).toBeInTheDocument();
    expect(within(dialog).getByRole('img')).toBeInTheDocument();
    const level = within(dialog).getByLabelText('Zoom level');
    expect(level).toHaveTextContent('100%');

    await user.click(within(dialog).getByRole('button', { name: 'Zoom in' }));
    expect(level).toHaveTextContent('125%');

    await user.keyboard('-');
    expect(level).toHaveTextContent('100%');

    await user.click(within(dialog).getByRole('button', { name: 'Close viewer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom diagram' })).toHaveFocus();
  });

  it('also opens when the diagram itself is clicked', async () => {
    const user = userEvent.setup();
    render(<Diagram spec={hello} />);
    await user.click(screen.getByRole('img'));
    expect(screen.getByRole('dialog', { name: 'Diagram viewer' })).toBeInTheDocument();
  });
});
