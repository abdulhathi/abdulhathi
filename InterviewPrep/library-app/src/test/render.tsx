import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ProgressProvider } from '../lib/progress';
import { RatingsProvider } from '../lib/ratings';
import { VoiceProvider } from '../lib/voice';

/** Render inside the same providers the app uses. */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <ProgressProvider>
      <RatingsProvider>
        <VoiceProvider>{ui}</VoiceProvider>
      </RatingsProvider>
    </ProgressProvider>,
  );
}
