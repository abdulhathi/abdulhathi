import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ProblemProvider } from '../lib/problems';
import { ProgressProvider } from '../lib/progress';

/** Render inside the same providers the app uses, for chapter bodies and pages. */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <ProgressProvider>
      <ProblemProvider>{ui}</ProblemProvider>
    </ProgressProvider>,
  );
}
