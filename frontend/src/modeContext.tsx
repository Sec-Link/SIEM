import React from 'react';

export type ModeType = 'auto'|'es'|'mock';

export const ModeContext = React.createContext<{ mode: ModeType; setMode: (m: ModeType) => void }>({
  mode: 'auto',
  setMode: () => {},
});

export default ModeContext;
