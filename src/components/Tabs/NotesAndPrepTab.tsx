import React from 'react';
import { Trip } from '../../types/itinerary';
import { Language } from '../../utils/i18n';
import { PackingTab } from './PackingTab';

interface NotesAndPrepTabProps {
  trip: Trip;
  lang: Language;
  onUpdateTrip: (updatedTrip: Trip) => void;
}

export const NotesAndPrepTab: React.FC<NotesAndPrepTabProps> = ({
  trip,
  lang,
  onUpdateTrip,
}) => {
  return <PackingTab trip={trip} lang={lang} onUpdateTrip={onUpdateTrip} />;
};
