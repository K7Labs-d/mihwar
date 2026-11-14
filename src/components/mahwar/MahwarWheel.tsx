/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { animate, motion, useMotionValue, useTransform, useReducedMotion, type MotionValue } from 'motion/react';
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
import { getBranchReveal, getLockMotion, getShackleTransform, WHEEL_OPEN_SECONDS, WHEEL_CLOSE_SECONDS } from '../../utils/wheelMotion';

// Keep nodes mounted so reversing the playhead never restarts an entrance.
const BranchMotion = ({ progress, index, x, y, children, ...props }: {
  progress: MotionValue<number>;
  index: number;
  x: number;
  y: number;
  children: React.ReactNode;
} & React.ComponentProps<typeof motion.button>) => {
  const reveal = useTransform(progress, value => getBranchReveal(value, index));
  const offsetX = useTransform(reveal, value => -x * 0.18 * (1 - value));
  const offsetY = useTransform(reveal, value => -y * 0.18 * (1 - value));
  const scale = useTransform(reveal, value => 0.82 + value * 0.18);
  return <motion.button {...props} style={{ ...props.style, opacity: reveal, x: offsetX, y: offsetY, scale }}>{children}</motion.button>;
};

const BranchTrack = ({ progress, index, children }: {
  progress: MotionValue<number>;
  index: number;
  children: React.ReactNode;
}) => {
  const reveal = useTransform(progress, value => getBranchReveal(value, index));
  return <motion.g style={{ opacity: reveal }}>{children}</motion.g>;
};

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
  
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLButtonElement>(null);
  const branchesId = useId();

  const state = externalState ?? internalState;
  const isPressing = state === 'pressing';
  const isBranchesVisible = state === 'open' || state === 'branch_hover';
  const isExpanded = state === 'unlocking' || isBranchesVisible;
  const isTransitioning = state === 'unlocking' || state === 'closing';
  const progress = useMotionValue(isBranchesVisible ? 1 : 0);
  const rimRotation = useTransform(progress, value => getLockMotion(value).rotation);
  const rimScale = useTransform(progress, value => getLockMotion(value).scale);
  const shackleTransform = useTransform(progress, getShackleTransform);
  const glowOpacity = useTransform(progress, [0, 1], [0.65, 0.85]);
  const glowScale = useTransform(progress, [0, 1], [1.05, 1.35]);
  const rimColor = useTransform(progress, [0, 0.5], ['#78350f', '#f59e0b']);
  const actionOpacity = useTransform(progress, [0.9, 1], [0, 1]);
  const actionY = useTransform(progress, [0.9, 1], [5, 0]);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const activeBranch = externalActiveBranchId !== undefined
    ? MAHWAR_BRANCHES.find(b => b.id === externalActiveBranchId) ?? null
    : internalActiveBranch;

  const updateState = useCallback((newState: MahwarState) => {
    setInternalState(newState);
    onStateChangeRef.current?.(newState);
  }, []);

  // Transitions are tied to state; reset, navigation and unmount cancel them.
  useEffect(() => {
    if (state === 'closed') setInternalActiveBranch(null);
    if (state !== 'unlocking' && state !== 'closing') {
      progress.set(state === 'open' || state === 'branch_hover' ? 1 : 0);
      return;
    }
    const opening = state === 'unlocking';
    const target = opening ? 1 : 0;
    if (opening) soundEngine.playUnlockSequence();
    // Motion schedules duration:0 writes for a later frame; set them directly
    // so a queued endpoint cannot overwrite a subsequent reset or reversal.
    if (reducedMotion || progress.get() === target) {
      progress.set(target);
      if (!opening) soundEngine.playLockShut();
      updateState(opening ? 'open' : 'closed');
      return;
    }
    let cancelled = false;
    let branchesSoundPlayed = progress.get() >= 0.52;
    const animation = animate(progress, target, {
      // A partial reversal travels only the remaining distance, with no jump.
      duration: Math.abs(target - progress.get()) * (opening ? WHEEL_OPEN_SECONDS : WHEEL_CLOSE_SECONDS),
      ease: 'linear',
      onUpdate: value => {
        if (!cancelled && opening && !branchesSoundPlayed && value >= 0.52) {
          branchesSoundPlayed = true;
          soundEngine.playBranchesExpand();
        }
      },
      onComplete: () => {
        if (cancelled) return;
        if (!opening) soundEngine.playLockShut();
        updateState(opening ? 'open' : 'closed');
      },
    });
    return () => {
      cancelled = true;
      animation.stop();
    }
  }, [state, reducedMotion, progress, updateState]);

  const handleCenterMouseDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (interactionLocked) return;
    onInteract?.();
    if (state === 'closed') { soundEngine.playPressDown(); updateState('pressing'); }
  };
  const handleCenterClick = () => {
    if (interactionLocked) return;
    onInteract?.();
    if (state === 'closed' || state === 'pressing' || state === 'closing') updateState('unlocking');
    else if (state === 'unlocking' || state === 'open' || state === 'branch_hover') handleClose();
  };
  const handleClose = () => {
    if (interactionLocked) return;
    const previousHash = window.location.hash;
    onInteract?.();
    setInternalActiveBranch(null);
    onBranchSelect?.(null);
    updateState('closing');
    const restoreFocus = () => requestAnimationFrame(() => {
      const button = centerRef.current ?? document.querySelector<HTMLButtonElement>('[data-hub-toggle]');
      if (button?.getAttribute('aria-expanded') === 'false') button.focus({ preventScroll: true });
    });
    if (window.location.hash !== previousHash) window.addEventListener('hashchange', restoreFocus, { once: true });
    else restoreFocus();
  };

  // Handle Branch Hover (State 05)
  const handleBranchHover = (branch: MahwarBranch | null) => {
    if (interactionLocked) return;
    onInteract?.();
    if (isBranchesVisible) {
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
  const coreSize = Math.min(200, Math.max(132, orbitSize * .48));
  const nodeSize = orbitSize < 320 ? 56 : orbitSize < 400 ? 66 : 84;

  return (
    <div 
      ref={containerRef}
      className="mihwar-wheel relative w-full flex flex-col items-center justify-center select-none py-6"
      data-wheel
      data-state={state}
      style={{ '--hub-core-size': `${coreSize}px`, '--hub-rim-size': `${coreSize + 40}px` } as React.CSSProperties}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isExpanded && !interactionLocked) {
          event.preventDefault();
          handleClose();
        }
      }}
      dir="rtl"
    >
      {/* Dynamic Ambient Background Glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {/* Core Warm Glow */}
        <motion.div 
          style={{ scale: glowScale, opacity: glowOpacity }}
          className="w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.22)_0%,rgba(217,119,6,0.08)_45%,transparent_70%)] blur-2xl"
        />
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
              stroke: isExpanded ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.06)',
              strokeWidth: isExpanded ? 1.5 : 1,
            }}
            transition={{ duration: 0.5 }}
            strokeDasharray="6 4"
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
          {MAHWAR_BRANCHES.map((branch, index) => {
            const rad = (branch.angle * Math.PI) / 180;
            const x2 = 280 + orbitRadiusDesktop * Math.cos(rad);
            const y2 = 280 + orbitRadiusDesktop * Math.sin(rad);
            // Midpoint for directional chevron
            const midX = 280 + (orbitRadiusDesktop * 0.58) * Math.cos(rad);
            const midY = 280 + (orbitRadiusDesktop * 0.58) * Math.sin(rad);
            const isHovered = activeBranch?.id === branch.id;

            return (
              <BranchTrack key={`track-${branch.id}`} progress={progress} index={index}>
                {/* Radial Glowing Line */}
                <line
                  x1="280"
                  y1="280"
                  x2={x2}
                  y2={y2}
                  stroke={isHovered ? 'url(#activeLaserGradient)' : 'url(#goldLineGradient)'}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  strokeDasharray="4 3"
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
              </BranchTrack>
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
            <div id={branchesId} role="group" aria-label="أقسام المحور" aria-hidden={!isBranchesVisible} inert={!isBranchesVisible || interactionLocked} className="absolute inset-0 pointer-events-none">
              {MAHWAR_BRANCHES.map((branch, index) => {
                const rad = (branch.angle * Math.PI) / 180;
                // Responsive calculation based on screen
                const isHovered = activeBranch?.id === branch.id;

                return (
                  <BranchMotion
                    progress={progress}
                    index={index}
                    x={orbitRadius * Math.cos(rad)}
                    y={orbitRadius * Math.sin(rad)}
                    type="button"
                    aria-label={branch.label}
                    aria-pressed={isHovered}
                    disabled={interactionLocked || !isBranchesVisible}
                    key={branch.id}
                    className="hub-branch absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-30"
                    style={{ left: `calc(50% + ${orbitRadius * Math.cos(rad)}px)`, top: `calc(50% + ${orbitRadius * Math.sin(rad)}px)`, touchAction: 'manipulation' }}
                    onClick={() => handleBranchHover(branch)}
                  >
                    {/* Branch Capsule */}
                    <div 
                      className={`hub-branch-capsule relative flex flex-col items-center justify-center cursor-pointer transition-all duration-300 rounded-full ${
                        isHovered 
                          ? 'shadow-[0_0_30px_rgba(245,158,11,0.55)] scale-105' 
                          : 'shadow-[0_0_18px_rgba(0,0,0,0.8)] hover:shadow-[0_0_24px_rgba(245,158,11,0.35)]'
                      }`}
                      style={{ width: nodeSize, height: nodeSize }}
                    >
                      {/* Outer Ring Glow */}
                      <div className={`absolute inset-0 rounded-full border transition-all duration-300 ${
                        isHovered 
                          ? 'border-amber-400 bg-amber-500/20 scale-105' 
                          : 'border-amber-500/40 bg-slate-900/80 hover:border-amber-400/80'
                      }`} />

                      {/* Inner Circular Metallic Capsule */}
                      <div className="hub-branch-face relative w-[88%] h-[88%] rounded-full bg-gradient-to-b from-[#111827] via-[#0b0f19] to-[#05070e] border border-amber-500/30 flex flex-col items-center justify-center p-2 backdrop-blur-md">
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
                  </BranchMotion>
                );
              })}
            </div>

        {/* ======================================================== */}
        {/* THE CENTRAL MAHWAR (محور) CORE HUB                      */}
        {/* ======================================================== */}
        <div className="relative z-20 flex items-center justify-center mahwar-core">
          
          {/* Segmented Mechanical Aperture Ring (Rotates and expands) */}
          <motion.div
            style={{ rotate: rimRotation, scale: rimScale, transformOrigin: '50% 50%' }}
            className="hub-rim absolute w-[230px] sm:w-[250px] h-[230px] sm:h-[250px] pointer-events-none"
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
              {/* Four true circular arcs share the hub's rotation center. */}
              <motion.circle
                cx="125"
                cy="125"
                r="110"
                fill="none"
                style={{ stroke: rimColor }}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${110 * Math.PI * 62 / 180} ${110 * Math.PI * 28 / 180}`}
                transform="rotate(-121 125 125)"
              />
            </svg>
          </motion.div>

          {/* Central Touch Button (The tactile interactive disk) */}
          <motion.button
            ref={centerRef}
            type="button"
            data-hub-toggle
            aria-controls={branchesId}
            aria-label={isExpanded ? "إغلاق مركز المحور" : "فتح المحور"}
            aria-expanded={isBranchesVisible}
            aria-busy={isTransitioning}
            disabled={interactionLocked}
            animate={{
              scale: isPressing ? 0.96 : isExpanded ? 1.03 : 1,
            }}
            whileHover={isTransitioning || isPressing ? undefined : { scale: isBranchesVisible ? 1.04 : 1.02 }}
            transition={{ type: 'spring', stiffness: 350, damping: 22 }}
            style={{ touchAction: 'manipulation' }}
            onPointerDown={handleCenterMouseDown}
            onPointerCancel={() => { if (state === 'pressing') updateState('closed'); }}
            onPointerLeave={() => { if (state === 'pressing') updateState('closed'); }}
            onClick={handleCenterClick}
            className={`hub-toggle group relative w-[180px] sm:w-[200px] h-[180px] sm:h-[200px] rounded-full cursor-pointer transition-all duration-300 flex flex-col items-center justify-center select-none ${
              isPressing 
                ? 'shadow-[inset_0_8px_25px_rgba(0,0,0,0.9),0_0_20px_rgba(245,158,11,0.6)]' 
                : isExpanded
                ? 'shadow-[0_0_28px_rgba(245,158,11,0.25),inset_0_2px_10px_rgba(251,191,36,0.3)]'
                : 'shadow-[0_0_30px_rgba(0,0,0,0.85),0_0_15px_rgba(245,158,11,0.25)] hover:shadow-[0_0_35px_rgba(245,158,11,0.5)]'
            }`}
          >
            {/* Outer Golden Border Rim */}
            <div className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
              isExpanded
                ? 'border-amber-400 bg-amber-500/10' 
                : isPressing 
                ? 'border-amber-500 scale-95' 
                : 'border-amber-500/50 group-hover:border-amber-400'
            }`} />

            {/* Inner Metallic Bezel with Brushed Texture */}
            <div className="hub-toggle-face relative w-[164px] sm:w-[184px] h-[164px] sm:h-[184px] rounded-full bg-gradient-to-b from-[#141c2e] via-[#090d16] to-[#04060b] border border-slate-700/60 flex flex-col items-center justify-center overflow-hidden">
              
              {/* Subtle Concentric Metallic Ring */}
              <div className="absolute inset-2 rounded-full border border-amber-500/15 pointer-events-none" />

              {/* Radial Highlight Reflection */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-20 bg-gradient-to-b from-white/15 to-transparent rounded-full blur-sm pointer-events-none" />

              {/* Padlock Icon Assembly (Shackle lifts & rotates on unlock!) */}
              <motion.div
                animate={{
                  y: isPressing ? 3 : 0,
                  scale: isPressing ? 0.96 : 1,
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
                  <svg width="28" height="20" viewBox="0 0 28 20" fill="none" className="overflow-visible" aria-hidden="true">
                    <motion.g data-lock-shackle style={{ transform: shackleTransform, originX: '6px', originY: '18px', transformBox: 'view-box' }}>
                    <path
                      d="M6 18 V9 C6 4.5 9.5 2 14 2 C18.5 2 22 4.5 22 9 V18"
                      stroke="#fbbf24"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    </motion.g>
                  </svg>

                {/* Padlock Body */}
                <div className="relative -mt-2 w-7 h-6 rounded-md bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 border border-amber-300 shadow-sm shadow-black/80 flex items-center justify-center">
                  {/* Keyhole Slit */}
                  <div className="w-1.5 h-2.5 bg-slate-950 rounded-full" />
                </div>
              </motion.div>

              {/* "محور" Typography and Logo Aperture Emblem */}
              <div className="flex items-center gap-2">
                <span className="hub-title text-xl sm:text-2xl font-black text-white tracking-wide font-['Cairo']">
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
                {state === 'unlocking' ? 'جارٍ فتح الأقسام' : state === 'closing' ? 'جارٍ الإغلاق' : isBranchesVisible ? 'الأقسام مفتوحة' : 'افتح الأقسام'}
              </div>
            </div>
          </motion.button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* BOTTOM ACTION & FEEDBACK AREA                            */}
      {/* ======================================================== */}
      <div className="hub-actions mt-4 sm:mt-6 flex flex-col items-center gap-2 min-h-[60px]">
        {/* Closed State Callout (Step 01 from reference image) */}
        {(state === 'closed' || state === 'pressing') && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="hub-action"
            disabled={interactionLocked}
            aria-controls={branchesId}
            aria-expanded={isBranchesVisible}
            style={{ touchAction: 'manipulation' }}
            onClick={handleCenterClick}
          >
            <Sparkles size={18} aria-hidden="true" />
            فتح أقسام محور
          </motion.button>
        )}

        {/* Open State Close Button (Step 06 from reference image) */}
        {state !== 'closed' && state !== 'pressing' && !interactionLocked && (
          <motion.div 
            style={{ opacity: actionOpacity, y: actionY }}
            inert={!isBranchesVisible}
            aria-hidden={!isBranchesVisible}
            className="flex flex-col items-center gap-1.5"
          >
            <button
              type="button"
              disabled={!isBranchesVisible}
              onClick={handleClose}
              aria-label="إغلاق المحور"
              style={{ touchAction: 'manipulation' }}
              className="hub-close group flex items-center justify-center w-11 h-11 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-500 text-slate-300 hover:text-amber-400 shadow-xl transition-all cursor-pointer"
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
