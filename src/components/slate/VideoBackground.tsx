import React from 'react';

interface VideoBackgroundProps {
  src: string;
  flip?: boolean;
  opacity?: number;
  className?: string;
}

const VideoBackground: React.FC<VideoBackgroundProps> = ({ 
  src, 
  flip = false, 
  opacity = 1,
  className = "" 
}) => {
  return (
    <div className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none ${className}`}>
      <video
        autoPlay
        muted
        loop
        playsInline
        className="w-full h-full object-cover"
        style={{ 
          transform: flip ? 'scaleX(-1)' : 'none',
          opacity: opacity
        }}
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
};

export default VideoBackground;
