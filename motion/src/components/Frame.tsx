import { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { fontsReady } from '../fonts';
import { Grain } from './Grain';
import { C } from '../theme';

// Cadre commun : attend les polices de la charte, fond albâtre, grain de papier par-dessus.
export const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender('Polices de la charte'));
  useEffect(() => { fontsReady.then(() => continueRender(handle)); }, [handle]);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {children}
      <Grain />
    </AbsoluteFill>
  );
};
