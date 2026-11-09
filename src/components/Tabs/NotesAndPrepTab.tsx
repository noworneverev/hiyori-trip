import React from 'react';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { PackingTab } from './PackingTab';

interface NotesAndPrepTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
  requireAuth?: (action: () => void, reason?: string) => boolean;
}

export const NotesAndPrepTab: React.FC<NotesAndPrepTabProps> = ({
  trip,
  lang,
  onUpdateTrip,
  requireAuth,
}) => {
  return <PackingTab trip={trip} lang={lang} onUpdateTrip={onUpdateTrip} requireAuth={requireAuth} />;
};
