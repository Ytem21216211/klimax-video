import * as React from 'react';
const { useLayoutEffect, useRef } = React;

import gsap from 'gsap';

interface SplitTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

const SplitText: React.FC<SplitTextProps> = ({ text, className, style }) => {
  const containerRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const chars = containerRef.current.querySelectorAll('.char');
    
    gsap.fromTo(chars, 
      { 
        opacity: 0,
        y: 20,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        stagger: 0.05,
        ease: 'power3.out',
        delay: 0.2
      }
    );
  }, [text]);

  // Handle <br /> in text
  const parts = text.split('<br />');

  return (
    <h1 ref={containerRef} className={className} style={style}>
      {parts.map((part, partIndex) => (
        <React.Fragment key={partIndex}>
          {part.split('').map((char, charIndex) => (
            <span 
              key={charIndex} 
              className="char inline-block whitespace-pre"
            >
              {char}
            </span>
          ))}
          {partIndex < parts.length - 1 && <br />}
        </React.Fragment>
      ))}
    </h1>
  );
};

export default SplitText;
