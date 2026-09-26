/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  FileText, 
  Users, 
  ClipboardCheck, 
  Settings, 
  User, 
  X, 
  MousePointerClick,
  Sparkles,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownLeft,
  ArrowUpLeft
} from 'lucide-react';
import { MahwarState, MahwarBranch } from '../../types/mahwar';
import { MAHWAR_BRANCHES } from '../../data/mahwarBranches';
import { soundEngine } from '../../utils/audioSynthesizer';

interface MahwarWheelProps {
  interactionLocked?: boolean;
  currentState?: MahwarState;
  onStateChange?: (state: MahwarState) => void;
  activeBranchId?: string | null;
  onBranchSelect?: (branch: MahwarBranch | null) => void;
  onInteract?: () => void;
}

export const MahwarWheel: React.FC<MahwarWheelProps> = ({
  interactionLocked = false,
  currentState: externalState,
  onStateChange,
  activeBranchId: externalActiveBranchId,
  onBranchSelect,
  onInteract,
}) => {
  const reducedMotion = useReducedMotion();
  // Internal state if not controlled externally
  const [internalState, setInternalState] = useState<MahwarState>('closed');
  const [internalActiveBranch, setInternalActiveBranch] = useState<MahwarBranch | null>(null);
  const [isPressing, setIsPressing] = useState<boolean>(false);
  const [isShackleOpen, setIsShackleOpen] = useState<boolean>(false);
  const [sparksActive, setSparksActive] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const state = externalState ?? internalState;
  const activeBranch = externalActiveBranchId !== undefined
    ? MAHWAR_BRANCHES.find(b => b.id === externalActiveBranchId) ?? null
    : internalActiveBranch;

  const updateState = (newState: MahwarState) => {
    setInternalState(newState);
    if (onStateChange) {
      onStateChange(newState);
    }
  };

  // Transitions are tied to state; reset, navigation and unmount cancel them.
  useEffect(() => {
    setIsPressing(state === 'pressing');
    setIsShackleOpen(['unlocking', 'open', 'branch_hover'].includes(state));
    setSparksActive(state === 'unlocking');
    if (state === 'closed') setInternalActiveBranch(null);
    if (state === 'unlocking') {
      soundEngine.playUnlockSequence();
      const timer = setTimeout(() => { updateState('open'); soundEngine.playBranchesExpand(); }, reducedMotion ? 0 : 420);
      return () => clearTimeout(timer);
    }
    if (state === 'closing') {
      const timer = setTimeout(() => updateState('closed'), reducedMotion ? 0 : 450);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const handleCenterMouseDown = () => {
    if (interactionLocked) return;
    onInteract?.();
    if (state === 'closed') { soundEngine.playPressDown(); updateState('pressing'); }
  };
  const handleCenterClick = () => {
    if (interactionLocked) return;
    onInteract?.();
    if (state === 'closed' || state === 'pressing') updateState('unlocking');
    else if (state === 'open' || state === 'branch_hover') handleClose();
  };
  const handleClose = () => {
    if (interactionLocked) return;
    onInteract?.();
    setInternalActiveBranch(null);
    onBranchSelect?.(null);
    updateState('closing');
    soundEngine.playLockShut();
  };

  // Handle Branch Hover (State 05)
  const handleBranchHover = (branch: MahwarBranch | null) => {
    if (interactionLocked) return;
    onInteract?.();
    if (state === 'open' || state === 'branch_hover') {
      if (branch) {
        setInternalActiveBranch(branch);
        updateState('branch_hover');
        soundEngine.playBranchHover();
        if (onBranchSelect) onBranchSelect(branch);
      } else {
        setInternalActiveBranch(null);
        updateState('open');
        if (onBranchSelect) onBranchSelect(null);
      }
    }
  };

  // Icon mapping
  const renderBranchIcon = (iconName: MahwarBranch['iconName']) => {
    switch (iconName) {
      case 'file-text':
        return <FileText className="w-6 h-6 text-amber-300" />;
      case 'users':
        return <Users className="w-6 h-6 text-amber-300" />;
      case 'clipboard-check':
        return <ClipboardCheck className="w-6 h-6 text-amber-300" />;
      case 'settings':
        return <Settings className="w-6 h-6 text-amber-300" />;
      case 'user':
        return <User className="w-6 h-6 text-amber-300" />;
    }
  };

  const isBranchesVisible = state === 'open' || state === 'branch_hover';
  const orbitRadiusDesktop = 210; // Radius for 5 branch nodes
  const [orbitSize, setOrbitSize] = useState(340);
  const orbitRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = orbitRef.current;
    if (!el) return;
    const update = () => setOrbitSize(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const orbitRadius = orbitSize * orbitRadiusDesktop / 560;

  return (
    <div 
      ref={containerRef}
      className="relative w-full flex flex-col items-center justify-center select-none py-6"
      data-wheel
      dir="rtl"
    >
      {/* Dynamic Ambient Background Glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {/* Core Warm Glow */}
        <motion.div 
          animate={{
            scale: isBranchesVisible ? 1.35 : isPressing ? 0.9 : 1.05,
            opacity: isBranchesVisible ? 0.85 : isPressing ? 0.95 : 0.65,
          }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.22)_0%,rgba(217,119,6,0.08)_45%,transparent_70%)] blur-2xl"
        />
        {/* Intense Core Flare when Unlocking */}
        <AnimatePresence>
          {sparksActive && !reducedMotion && (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1.8, opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.6)_0%,rgba(245,158,11,0.3)_40%,transparent_70%)] blur-xl"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Main Wheel Canvas Area */}
      <div ref={orbitRef} className="relative w-full max-w-[560px] aspect-square flex items-center justify-center">
        
        {/* Concentric Guide Orbits & Trajectory Rings */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none" 
          viewBox="0 0 560 560"
        >
          {/* Outermost Orbit Grid */}
          <circle 
            cx="280" 
            cy="280" 
            r="260" 
            fill="none" 
            stroke="rgba(245, 158, 11, 0.08)" 
            strokeWidth="1" 
            strokeDasharray="4 6" 
          />
          {/* Branch Orbit Path */}
          <motion.circle 
            cx="280" 
            cy="280" 
            r={orbitRadiusDesktop} 
            fill="none" 
            animate={{
              stroke: isBranchesVisible ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.06)',
              strokeWidth: isBranchesVisible ? 1.5 : 1,
            }}
            transition={{ duration: 0.5 }}
            strokeDasharray={isBranchesVisible ? '6 4' : '2 6'} 
          />
          {/* Inner Trajectory Ring */}
          <circle 
            cx="280" 
            cy="280" 
            r="140" 
            fill="none" 
            stroke="rgba(245, 158, 11, 0.12)" 
            strokeWidth="1" 
          />

          {/* Energy Tracks & Pulsing Arrows between Branches and Center */}
          {isBranchesVisible && MAHWAR_BRANCHES.map((branch) => {
            const rad = (branch.angle * Math.PI) / 180;
            const x2 = 280 + orbitRadiusDesktop * Math.cos(rad);
            const y2 = 280 + orbitRadiusDesktop * Math.sin(rad);
            // Midpoint for directional chevron
            const midX = 280 + (orbitRadiusDesktop * 0.58) * Math.cos(rad);
            const midY = 280 + (orbitRadiusDesktop * 0.58) * Math.sin(rad);
            const isHovered = activeBranch?.id === branch.id;

            return (
              <g key={`track-${branch.id}`}>
                {/* Radial Glowing Line */}
                <motion.line
                  x1="280"
                  y1="280"
                  x2={x2}
                  y2={y2}
                  stroke={isHovered ? 'url(#activeLaserGradient)' : 'url(#goldLineGradient)'}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  strokeDasharray="4 3"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                />

                {/* Energy Pulse Ring at Hub Joint */}
                <circle
                  cx={280 + 82 * Math.cos(rad)}
                  cy={280 + 82 * Math.sin(rad)}
                  r={isHovered ? 4 : 2.5}
                  fill={isHovered ? '#fbbf24' : '#f59e0b'}
                  className="animate-pulse"
                />

                {/* Directional Arrow toward Center */}
                <g transform={`translate(${midX}, ${midY}) rotate(${branch.angle + 180})`}>
                  <path
                    d="M-4,-4 L2,0 L-4,4"
                    fill="none"
                    stroke={isHovered ? '#fde68a' : '#f59e0b'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </g>
            );
          })}

          {/* Gradients */}
          <defs>
            <linearGradient id="goldLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#d97706" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#b45309" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="activeLaserGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />
              <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.6" />
            </linearGradient>
          </defs>
        </svg>

        {/* ======================================================== */}
        {/* 5 SATELLITE BRANCH NODES (Visible in State 04, 05)       */}
        {/* ======================================================== */}
        <AnimatePresence>
          {isBranchesVisible && (
            <div className="absolute inset-0 pointer-events-none">
              {MAHWAR_BRANCHES.map((branch, index) => {
                const rad = (branch.angle * Math.PI) / 180;
                // Responsive calculation based on screen
                const isHovered = activeBranch?.id === branch.id;

                return (
                  <motion.button
                    type="button"
                    aria-label={branch.label}
                    aria-pressed={isHovered}
                    disabled={interactionLocked}
                    key={branch.id}
                    initial={{ 
                      x: 0, 
                      y: 0, 
                      scale: 0.2, 
                      opacity: 0 
                    }}
                    animate={{ 
                      x: orbitRadius * Math.cos(rad), 
                      y: orbitRadius * Math.sin(rad), 
                      scale: isHovered ? 1.15 : 1, 
                      opacity: 1 
                    }}
                    exit={{ 
                      x: 0, 
                      y: 0, 
                      scale: 0.2, 
                      opacity: 0,
                      transition: { duration: 0.35, ease: 'easeInOut' }
                    }}
                    transition={{ 
                      type: 'spring', 
                      stiffness: 220, 
                      damping: 20, 
                      delay: index * 0.05 
                    }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-30"
                    onClick={() => handleBranchHover(branch)}
                  >
                    {/* Branch Capsule */}
                    <div 
                      className={`relative flex flex-col items-center justify-center cursor-pointer transition-all duration-300 rounded-full ${
                        isHovered 
                          ? 'shadow-[0_0_30px_rgba(245,158,11,0.55)] scale-105' 
                          : 'shadow-[0_0_18px_rgba(0,0,0,0.8)] hover:shadow-[0_0_24px_rgba(245,158,11,0.35)]'
                      }`}
                      style={{ width: orbitSize < 400 ? '66px' : '84px', height: orbitSize < 400 ? '66px' : '84px' }}
                    >
                      {/* Outer Ring Glow */}
                      <div className={`absolute inset-0 rounded-full border transition-all duration-300 ${
                        isHovered 
                          ? 'border-amber-400 bg-amber-500/20 scale-105' 
                          : 'border-amber-500/40 bg-slate-900/80 hover:border-amber-400/80'
                      }`} />

                      {/* Inner Circular Metallic Capsule */}
                      <div className="relative w-[88%] h-[88%] rounded-full bg-gradient-to-b from-[#111827] via-[#0b0f19] to-[#05070e] border border-amber-500/30 flex flex-col items-center justify-center p-2 backdrop-blur-md">
                        {/* Icon */}
                        <div className={`transition-transform duration-300 ${isHovered ? 'scale-110 text-amber-300' : 'text-slate-300'}`}>
                          {renderBranchIcon(branch.iconName)}
                        </div>

                        {/* Title Label */}
                        <span className="text-[12px] font-bold text-white tracking-wide mt-1 font-['Cairo']">
                          {branch.label}
                        </span>

                        {/* Optional Step Badge (e.g. Badge 1 on 'الطلب') */}
                        {branch.badge && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-md shadow-amber-500/40 border border-amber-300">
                            {branch.badge}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {/* ======================================================== */}
        {/* THE CENTRAL MAHWAR (محور) CORE HUB                      */}
        {/* ======================================================== */}
        <div className="relative z-20 flex items-center justify-center mahwar-core">
          
          {/* Segmented Mechanical Aperture Ring (Rotates and expands) */}
          <motion.div
            animate={{
              rotate: isBranchesVisible ? 36 : isPressing ? 8 : 0,
              scale: isBranchesVisible ? 1.08 : isPressing ? 0.94 : 1,
            }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            className="absolute w-[230px] sm:w-[250px] h-[230px] sm:h-[250px] pointer-events-none"
          >
            {/* 4 Segmented Mechanical Arc Plates */}
            <svg viewBox="0 0 250 250" className="w-full h-full">
              {/* Outer Golden Notches */}
              <circle
                cx="125"
                cy="125"
                r="120"
                fill="none"
                stroke="rgba(245, 158, 11, 0.2)"
                strokeWidth="1.5"
                strokeDasharray="3 7"
              />
              {/* Top Segment */}
              <path
                d="M 65 35 A 115 115 0 0 1 185 35"
                fill="none"
                stroke={isBranchesVisible ? '#f59e0b' : '#78350f'}
                strokeWidth="6"
                strokeLinecap="round"
                className="transition-colors duration-500"
              />
              {/* Right Segment */}
              <path
                d="M 215 65 A 115 115 0 0 1 215 185"
                fill="none"
                stroke={isBranchesVisible ? '#f59e0b' : '#78350f'}
                strokeWidth="6"
                strokeLinecap="round"
                className="transition-colors duration-500"
              />
              {/* Bottom Segment */}
              <path
                d="M 185 215 A 115 115 0 0 1 65 215"
                fill="none"
                stroke={isBranchesVisible ? '#f59e0b' : '#78350f'}
                strokeWidth="6"
                strokeLinecap="round"
                className="transition-colors duration-500"
              />
              {/* Left Segment */}
              <path
                d="M 35 185 A 115 115 0 0 1 35 65"
                fill="none"
                stroke={isBranchesVisible ? '#f59e0b' : '#78350f'}
                strokeWidth="6"
                strokeLinecap="round"
                className="transition-colors duration-500"
              />
            </svg>
          </motion.div>

          {/* Central Touch Button (The tactile interactive disk) */}
          <motion.button
            type="button"
            aria-label={isBranchesVisible ? "إغلاق مركز المحور" : "فتح المحور"}
            aria-expanded={isBranchesVisible}
            disabled={interactionLocked}
            animate={{
              scale: isPressing ? 0.94 : isBranchesVisible ? 1.03 : 1,
            }}
            whileHover={{ scale: isBranchesVisible ? 1.04 : 1.03 }}
            transition={{ type: 'spring', stiffness: 350, damping: 22 }}
            onPointerDown={handleCenterMouseDown}
            onPointerCancel={() => { if (state === 'pressing') updateState('closed'); }}
            onPointerLeave={() => { if (state === 'pressing') updateState('closed'); }}
            onClick={handleCenterClick}
            className={`group relative w-[180px] sm:w-[200px] h-[180px] sm:h-[200px] rounded-full cursor-pointer transition-all duration-300 flex flex-col items-center justify-center select-none ${
              isPressing 
                ? 'shadow-[inset_0_8px_25px_rgba(0,0,0,0.9),0_0_20px_rgba(245,158,11,0.6)]' 
                : isBranchesVisible
                ? 'shadow-[0_0_28px_rgba(245,158,11,0.25),inset_0_2px_10px_rgba(251,191,36,0.3)]'
                : 'shadow-[0_0_30px_rgba(0,0,0,0.85),0_0_15px_rgba(245,158,11,0.25)] hover:shadow-[0_0_35px_rgba(245,158,11,0.5)]'
            }`}
          >
            {/* Outer Golden Border Rim */}
            <div className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
              isBranchesVisible 
                ? 'border-amber-400 bg-amber-500/10' 
                : isPressing 
                ? 'border-amber-500 scale-95' 
                : 'border-amber-500/50 group-hover:border-amber-400'
            }`} />

            {/* Inner Metallic Bezel with Brushed Texture */}
            <div className="relative w-[164px] sm:w-[184px] h-[164px] sm:h-[184px] rounded-full bg-gradient-to-b from-[#141c2e] via-[#090d16] to-[#04060b] border border-slate-700/60 flex flex-col items-center justify-center overflow-hidden">
              
              {/* Subtle Concentric Metallic Ring */}
              <div className="absolute inset-2 rounded-full border border-amber-500/15 pointer-events-none" />

              {/* Radial Highlight Reflection */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-20 bg-gradient-to-b from-white/15 to-transparent rounded-full blur-sm pointer-events-none" />

              {/* Padlock Icon Assembly (Shackle lifts & rotates on unlock!) */}
              <motion.div
                animate={{
                  y: isPressing ? 3 : 0,
                  scale: isPressing ? 0.92 : isShackleOpen ? 1.03 : 1,
                }}
                transition={{
                  type: 'spring',
                  stiffness: isPressing ? 620 : 430,
                  damping: isPressing ? 32 : 20,
                  mass: 0.55,
                }}
                className="relative mb-2 flex flex-col items-center origin-center"
              >
                {/* Padlock Shackle (Top Arc) */}
                <motion.div
                  animate={{
                    y: isShackleOpen ? -9 : 0,
                    rotate: isShackleOpen ? -26 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className="origin-bottom-left"
                >
                  <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
                    <path
                      d="M6 18 V9 C6 4.5 9.5 2 14 2 C18.5 2 22 4.5 22 9 V18"
                      stroke="#fbbf24"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.div>

                {/* Padlock Body */}
                <div className="relative -mt-2 w-7 h-6 rounded-md bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 border border-amber-300 shadow-sm shadow-black/80 flex items-center justify-center">
                  {/* Keyhole Slit */}
                  <div className="w-1.5 h-2.5 bg-slate-950 rounded-full" />
                </div>
              </motion.div>

              {/* "محور" Typography and Logo Aperture Emblem */}
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black text-white tracking-wide font-['Cairo']">
                  محور
                </span>

                {/* Glowing Aperture / Crescent Emblem */}
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 animate-pulse" style={{ animationDuration: '4s' }}>
                    {/* Glowing Aperture Arc */}
                    <path
                      d="M 12 3 A 9 9 0 1 1 3 12"
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    {/* Center Energy Dot */}
                    <circle cx="12" cy="12" r="2.5" fill="#f59e0b" />
                    {/* Small Accompanying Satellite Dot */}
                    <circle cx="5" cy="5" r="1.5" fill="#fef08a" />
                  </svg>
                </div>
              </div>

              {/* Status Hint below Hub */}
              <div className="mt-1 text-[10px] font-bold text-amber-400/80 tracking-wider">
                منظومة متكاملة
              </div>
            </div>
          </motion.button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* BOTTOM ACTION & FEEDBACK AREA                            */}
      {/* ======================================================== */}
      <div className="mt-4 sm:mt-6 flex flex-col items-center gap-2 min-h-[60px]">
        {/* Closed State Callout (Step 01 from reference image) */}
        {!isBranchesVisible && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-1.5 cursor-pointer group"
            onClick={handleCenterClick}
          >
            <span className="text-sm sm:text-base font-bold text-slate-200 group-hover:text-amber-400 transition-colors font-['Cairo'] flex items-center gap-2">
              <span>اضغط لفتح المحور</span>
              <Sparkles className="w-4 h-4 text-amber-400 animate-bounce" />
            </span>
            <div className="w-6 h-8 rounded-full border-2 border-amber-500/60 flex items-start justify-center p-1 group-hover:border-amber-400 transition-colors">
              <motion.div 
                animate={{ y: reducedMotion ? 0 : [0, 8, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                className="w-1.5 h-2 rounded-full bg-amber-400"
              />
            </div>
          </motion.div>
        )}

        {/* Open State Close Button (Step 06 from reference image) */}
        {isBranchesVisible && !interactionLocked && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-1.5"
          >
            <button
              onClick={handleClose}
              className="group flex items-center justify-center w-11 h-11 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-500 text-slate-300 hover:text-amber-400 shadow-xl transition-all cursor-pointer"
              title="إغلاق المحور"
            >
              <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            </button>
            <span className="text-xs font-bold text-slate-300 font-['Cairo']">
              إغلاق المحور
            </span>
            <span className="text-[11px] text-slate-500">
              اختر أحد الفروع لاستكشاف وظائفه
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
};
