import { DanceFamily } from './danceMoves';

// 11 UI pills total (fits mobile viewport width; AUTO remains first and default)
export type DanceStyle =
  | 'AUTO'
  | 'IDLE'
  | 'HIP_HOP_GROOVE'
  | 'MELBOURNE_SHUFFLE'
  | 'DISCO_FUNK'
  | 'BASS_DROP_BREAKDANCE'
  | 'INDIAN_CLASSICAL'
  | 'INDIAN_FOLK'
  | 'BOLLYWOOD'
  | 'GLOBAL_PARTY';

export const DANCE_STYLE_PILLS: readonly { id: DanceStyle; label: string }[] = [
  { id: 'AUTO', label: '✨ Auto DJ' },
  { id: 'INDIAN_CLASSICAL', label: '🪷 Classical' },
  { id: 'INDIAN_FOLK', label: '🥁 Bhangra/Folk' },
  { id: 'BOLLYWOOD', label: '🎬 Filmi/Mass' },
  { id: 'GLOBAL_PARTY', label: '🌍 Viral/Club' },
  { id: 'HIP_HOP_GROOVE', label: '🧢 Hip-Hop' },
  { id: 'MELBOURNE_SHUFFLE', label: '👟 Shuffle' },
  { id: 'DISCO_FUNK', label: '🪩 Disco/Lock' },
  { id: 'BASS_DROP_BREAKDANCE', label: '⚡ Breakdance' },
  { id: 'IDLE', label: '😺 Chill' },
];

export function mapStyleToFamily(style: DanceStyle): DanceFamily | 'AUTO' {
  switch (style) {
    case 'AUTO': return 'AUTO';
    case 'IDLE': return 'IDLE';
    case 'HIP_HOP_GROOVE': return 'HIP_HOP';
    case 'MELBOURNE_SHUFFLE': return 'SHUFFLE';
    case 'DISCO_FUNK': return 'DISCO_FUNK';
    case 'BASS_DROP_BREAKDANCE': return 'BREAKDANCE';
    case 'INDIAN_CLASSICAL': return 'INDIAN_CLASSICAL';
    case 'INDIAN_FOLK': return 'INDIAN_FOLK';
    case 'BOLLYWOOD': return 'BOLLYWOOD';
    case 'GLOBAL_PARTY': return 'GLOBAL_PARTY';
  }
}
