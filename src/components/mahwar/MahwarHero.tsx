/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { MahwarState, MahwarBranch } from '../../types/mahwar';
import { MahwarWheel } from './MahwarWheel';

export const MahwarHero: React.FC<{ onClientLogin?: () => void }> = ({ onClientLogin }) => {
  const [currentState, setCurrentState] = useState<MahwarState>('closed');
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-between px-4 sm:px-6 lg:px-8 py-8 sm:py-12 overflow-hidden bg-[#05070e]" dir="rtl">
      
      {/* Background Starfield and Ambient Atmosphere */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {/* Golden Central Nebula Aura */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] sm:w-[1000px] h-[700px] sm:h-[1000px] bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.12)_0%,rgba(180,83,9,0.04)_40%,transparent_70%)] blur-3xl" />
        {/* Soft Blue Depth Accent */}
        <div className="absolute -top-40 right-10 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(59,130,246,0.03)_0%,transparent_70%)] blur-3xl" />
        
        {/* Micro-particle Constellation Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#f59e0b12_1px,transparent_1px)] [background-size:32px_32px] opacity-70" />
      </div>

      {/* Top Banner / Heading Area */}
      <div className="relative z-10 max-w-4xl mx-auto text-center mb-2 sm:mb-4">
        {/* Subtle Pill Tag */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold mb-4 backdrop-blur-md font-['Cairo'] shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
          <span>الجيل الجديد من وساطة وتشغيل المعدات</span>
        </motion.div>

        {/* Title */}
        <motion.h1 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.2] font-['Cairo'] mb-3"
        >
          منظومة <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">محور</span> التفاعلية
        </motion.h1>

        {/* Subtitle */}
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed font-['Cairo']"
        >
          اضغط على مركز المحور لفك القفل الميكانيكي واستكشاف فروع المنظومة المتصلة بين المستأجر، الوسيط، والموردين.
        </motion.p>
      </div>

      {/* Center Stage: The Interactive Mahwar Wheel */}
      <div className="relative z-20 w-full flex items-center justify-center my-auto">
        <MahwarWheel
          onClientLogin={onClientLogin}
          currentState={currentState}
          onStateChange={setCurrentState}
          activeBranchId={activeBranchId}
          onBranchSelect={(branch: MahwarBranch | null) => setActiveBranchId(branch?.id ?? null)}
        />
      </div>

    </section>
  );
};
