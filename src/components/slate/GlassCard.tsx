import React from 'react';

interface GlassCardProps {
  theme: 'orange' | 'blue' | 'green';
  icon: React.ReactNode;
  title: string;
  description: string;
  linkText?: string;
  className?: string;
}

const GlassCard: React.FC<GlassCardProps> = ({ 
  theme, 
  icon, 
  title, 
  description, 
  linkText = "Learn more →",
  className = ""
}) => {
  return (
    <div className={`slate-card ${theme} ${className}`}>
      <div className="slate-glass" />
      <div className="slate-depth" />
      <div className="slate-card-content">
        <div className="slate-icon-box">
          {icon}
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
        <a href="#">{linkText}</a>
      </div>
    </div>
  );
};

export default GlassCard;
