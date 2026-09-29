import React from 'react';
import { motion } from 'framer-motion';

const ambientLayers = [
  {
    className: '-left-[18%] -top-[12%] h-[62vw] w-[62vw] max-h-[52rem] max-w-[52rem]',
    color: 'var(--brand-navigation-highlight)',
    animate: { x: ['-4%', '7%', '-4%'], y: ['-3%', '8%', '-3%'], scale: [1, 1.08, 1] },
    duration: 20,
  },
  {
    className: '-right-[18%] bottom-[-22%] h-[58vw] w-[58vw] max-h-[48rem] max-w-[48rem]',
    color: 'var(--brand-navigation-accent)',
    animate: { x: ['5%', '-8%', '5%'], y: ['4%', '-7%', '4%'], scale: [1.08, 0.98, 1.08] },
    duration: 25,
  },
];

const PublicHeroBackground = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[var(--brand-navigation)]" aria-hidden="true">
    <div className="absolute inset-0 bg-grid-pattern opacity-30" />
    {ambientLayers.map((layer) => (
      <motion.div
        key={layer.className}
        className={`absolute rounded-full blur-[90px] ${layer.className}`}
        style={{ backgroundColor: layer.color, opacity: 0.24 }}
        animate={layer.animate}
        transition={{ duration: layer.duration, repeat: Infinity, ease: 'easeInOut' }}
      />
    ))}
    <motion.div
      className="absolute left-1/2 top-[47%] h-64 w-[min(78vw,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-navigation-accent)] opacity-20 blur-[78px]"
      animate={{ opacity: [0.25, 0.72, 0.25], scale: [0.88, 1.08, 0.88] }}
      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    />
    {Array.from({ length: 14 }, (_, index) => (
      <motion.span
        key={index}
        className="absolute h-1 w-1 rounded-full bg-[var(--brand-navigation-accent)] shadow-[0_0_12px_var(--brand-navigation-accent)]"
        style={{ left: `${8 + ((index * 17) % 84)}%`, top: `${16 + ((index * 23) % 62)}%` }}
        animate={{ opacity: [0.12, 0.9, 0.12], y: [8, -10, 8], scale: [0.7, 1.35, 0.7] }}
        transition={{ duration: 3.2 + (index % 4), delay: index * 0.18, repeat: Infinity, ease: 'easeInOut' }}
      />
    ))}
    <div className="absolute inset-x-[-8%] bottom-0 h-[30%] opacity-55 [clip-path:polygon(0_100%,0_76%,13%_46%,24%_73%,39%_24%,50%_68%,65%_38%,79%_76%,91%_51%,100%_78%,100%_100%)] bg-[#063531]" />
    <div className="absolute inset-x-[-10%] bottom-0 h-[22%] opacity-80 [clip-path:polygon(0_100%,0_74%,18%_43%,31%_78%,47%_36%,61%_74%,76%_48%,89%_80%,100%_58%,100%_100%)] bg-[#042b28]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,rgba(2,24,34,.12)_42%,rgba(2,20,29,.72)_100%)]" />
    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#06312d]" />
  </div>
);

export default PublicHeroBackground;
